import { beforeEach, vi } from 'vitest'
import { mockedApiModule, resetMockApi } from './helpers/mockApi'

vi.mock('~/utils/api', () => mockedApiModule)

class ResizeObserverMock {
  observe() {}
  unobserve() {}
  disconnect() {}
}

vi.stubGlobal('ResizeObserver', ResizeObserverMock)

beforeEach(() => {
  vi.clearAllMocks()
  resetMockApi()
})
