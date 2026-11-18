// @vitest-environment happy-dom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import {
  act,
  cleanup,
  fireEvent,
  render,
  waitFor,
  within,
} from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { FollowEntry, ViewerState } from '@/lib/viewer/server'
import { FirstRunFollows } from '@/components/follows/FirstRunFollows'
import { DEFAULT_LEAGUE_SETTINGS } from '@/lib/model/leagues'
import { VIEWER_KEY } from '@/lib/viewer/queries'

// Server functions are Start RPC stubs and the repo has no HTTP mocking
// layer for them, so the module is replaced: each fn answers like D1 would.
const server = vi.hoisted(() => ({
  getViewerState: vi.fn(),
  setFollow: vi.fn(),
  dismissFirstRun: vi.fn(),
  leagueFollowables: vi.fn(),
  searchFollowables: vi.fn(),
  markRead: vi.fn(),
  setLeagueSettings: vi.fn(),
  setPriceDisplay: vi.fn(),
}))
vi.mock('@/lib/viewer/server', () => server)

// The picker navigates on Done and links to /follows; no router is mounted.
const navigate = vi.hoisted(() => vi.fn())
vi.mock('@tanstack/react-router', () => ({
  useNavigate: () => navigate,
  Link: ({ to, children, ...rest }: { to: string; children: unknown }) => (
    <a href={to} {...(rest as object)}>
      {children as never}
    </a>
  ),
}))

const team = (id: string, label: string, detail: string): FollowEntry => ({
  follow: { kind: 'team', teamId: id },
  label,
  detail,
  league: 'nfl',
  logoUrl: null,
})

const NFL_TEAMS = [
  team('nfl-buf', 'Buffalo Bills', 'BUF'),
  team('nfl-kc', 'Kansas City Chiefs', 'KC'),
]

function viewerState(over: Partial<ViewerState> = {}): ViewerState {
  return {
    viewer: { id: 'u1', name: 'V', image: null, email: 'v@example.com' },
    follows: [],
    readAt: null,
    leagues: DEFAULT_LEAGUE_SETTINGS,
    priceDisplay: 'cents',
    firstRunDone: false,
    ...over,
  }
}

let client: QueryClient

function renderPicker(state: ViewerState = viewerState()) {
  client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  client.setQueryData(VIEWER_KEY, state)
  return render(
    <QueryClientProvider client={client}>
      <FirstRunFollows />
    </QueryClientProvider>,
  )
}

beforeEach(() => {
  server.leagueFollowables.mockResolvedValue(NFL_TEAMS)
  server.dismissFirstRun.mockResolvedValue(undefined)
  // Like the real one: the Viewer's Follows after the change.
  server.setFollow.mockImplementation(
    ({ data }: { data: { target: string; following: boolean } }) =>
      Promise.resolve(
        data.following
          ? NFL_TEAMS.filter(
              (t) =>
                t.follow.kind === 'team' && t.follow.teamId === data.target,
            )
          : [],
      ),
  )
})

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

describe('FirstRunFollows', () => {
  it('offers the Viewer’s Leagues to a Viewer with no Follows', () => {
    const { getByRole } = renderPicker()
    expect(getByRole('heading', { name: 'Make this Timeline yours' }))
    const leagues = within(getByRole('list', { name: 'Leagues' }))
      .getAllByRole('button')
      .map((b) => b.textContent)
    expect(leagues).toEqual(['MLB', 'NBA', 'NFL', 'College Football', 'NHL'])
    // Nothing picked yet: there's no next step to take.
    expect(getByRole('button', { name: 'Next' })).toHaveProperty(
      'disabled',
      true,
    )
  })

  it('leaves out Leagues the Viewer hid', () => {
    const { getByRole } = renderPicker(
      viewerState({
        leagues: { ...DEFAULT_LEAGUE_SETTINGS, hidden: ['nhl', 'mlb'] },
      }),
    )
    const leagues = within(getByRole('list', { name: 'Leagues' }))
      .getAllByRole('button')
      .map((b) => b.textContent)
    expect(leagues).toEqual(['NBA', 'NFL', 'College Football'])
  })

  it('isn’t shown once the Viewer follows anything', () => {
    const { container } = renderPicker(
      viewerState({
        follows: [team('nfl-buf', 'Buffalo Bills', 'BUF')],
      }),
    )
    expect(container.innerHTML).toBe('')
  })

  it('isn’t shown again once skipped or finished', () => {
    const { container } = renderPicker(viewerState({ firstRunDone: true }))
    expect(container.innerHTML).toBe('')
  })

  it('isn’t shown to a signed-out visitor', () => {
    const { container } = renderPicker(viewerState({ viewer: null }))
    expect(container.innerHTML).toBe('')
  })

  it('goes from picked Leagues to their Teams, and follows a tapped Team', async () => {
    const { getByRole, findByRole, getByText } = renderPicker()
    fireEvent.click(getByRole('button', { name: 'NFL' }))
    expect(
      getByRole('button', { name: 'NFL' }).getAttribute('aria-pressed'),
    ).toBe('true')
    fireEvent.click(getByRole('button', { name: 'Next' }))

    expect(getByRole('heading', { name: 'Pick your Teams' }))
    const bills = await findByRole('button', { name: 'Buffalo Bills' })
    expect(server.leagueFollowables).toHaveBeenCalledWith({
      data: { leagues: ['nfl'] },
    })
    // A whole League can be followed from here too.
    expect(within(getByRole('region', { name: 'NFL' })).getByText('Follow'))
    expect(getByRole('button', { name: 'Done' })).toHaveProperty(
      'disabled',
      true,
    )
    expect(getByText('Pick one to finish'))

    let answer: (entries: Array<FollowEntry>) => void = () => {}
    server.setFollow.mockReturnValueOnce(
      new Promise<Array<FollowEntry>>((resolve) => (answer = resolve)),
    )
    fireEvent.click(bills)
    // Pressed at once, before the server answers.
    await waitFor(() => expect(bills.getAttribute('aria-pressed')).toBe('true'))
    expect(getByRole('button', { name: 'Done' })).toHaveProperty(
      'disabled',
      true,
    )
    expect(server.setFollow).toHaveBeenCalledWith({
      data: { kind: 'team', target: 'nfl-buf', following: true },
    })
    act(() => answer([NFL_TEAMS[0]]))
    await waitFor(() =>
      expect(getByRole('button', { name: 'Done' })).toHaveProperty(
        'disabled',
        false,
      ),
    )
    // The first Follow doesn't close the picker mid-pick.
    expect(getByRole('heading', { name: 'Pick your Teams' }))
    expect(getByText('Following 1'))
    expect(bills.getAttribute('aria-pressed')).toBe('true')
  })

  it('goes back to the Leagues, keeping what was picked', async () => {
    const { getByRole, findByRole } = renderPicker()
    fireEvent.click(getByRole('button', { name: 'NFL' }))
    fireEvent.click(getByRole('button', { name: 'Next' }))
    await findByRole('button', { name: 'Buffalo Bills' })
    fireEvent.click(getByRole('button', { name: 'Back' }))
    expect(
      getByRole('button', { name: 'NFL' }).getAttribute('aria-pressed'),
    ).toBe('true')
  })

  it('offers a filter when a League has many Teams', async () => {
    server.leagueFollowables.mockResolvedValue(
      Array.from({ length: 45 }, (_, i) =>
        team(`cfb-${i}`, i === 7 ? 'Notre Dame' : `Team ${i}`, `T${i}`),
      ).map((t) => ({ ...t, league: 'cfb' as const })),
    )
    const { getByRole, findByRole, queryByRole } = renderPicker()
    fireEvent.click(getByRole('button', { name: 'College Football' }))
    fireEvent.click(getByRole('button', { name: 'Next' }))
    const filter = await findByRole('searchbox', { name: 'Find a Team' })
    fireEvent.change(filter, { target: { value: 'notre' } })
    expect(getByRole('button', { name: 'Notre Dame' }))
    expect(queryByRole('button', { name: 'Team 1' })).toBeNull()
  })

  it('says so when the Teams can’t load, and tries again', async () => {
    server.leagueFollowables.mockRejectedValueOnce(new Error('down'))
    const { getByRole, findByRole } = renderPicker()
    fireEvent.click(getByRole('button', { name: 'NFL' }))
    fireEvent.click(getByRole('button', { name: 'Next' }))
    fireEvent.click(await findByRole('button', { name: 'Try again' }))
    expect(await findByRole('button', { name: 'Buffalo Bills' }))
  })

  it('when skipped, closes and remembers it for the Viewer', async () => {
    const { getByRole, container } = renderPicker()
    fireEvent.click(getByRole('button', { name: 'Skip' }))
    expect(container.innerHTML).toBe('')
    await waitFor(() => expect(server.dismissFirstRun).toHaveBeenCalled())
    expect(client.getQueryData<ViewerState>(VIEWER_KEY)?.firstRunDone).toBe(
      true,
    )
    expect(navigate).not.toHaveBeenCalled()
  })

  it('when finished, lands on the Following Scope for today', async () => {
    const { getByRole, findByRole, container } = renderPicker()
    fireEvent.click(getByRole('button', { name: 'NFL' }))
    fireEvent.click(getByRole('button', { name: 'Next' }))
    fireEvent.click(await findByRole('button', { name: 'Kansas City Chiefs' }))
    const done = getByRole('button', { name: 'Done' })
    await waitFor(() => expect(done).toHaveProperty('disabled', false))
    act(() => {
      fireEvent.click(done)
    })
    expect(container.innerHTML).toBe('')
    // A fresh search: no past day, Game or Prediction carried over.
    expect(navigate).toHaveBeenCalledWith({
      to: '/',
      search: { scope: 'following' },
    })
    expect(server.dismissFirstRun).not.toHaveBeenCalled()
  })
})
