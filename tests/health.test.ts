import { buildApp } from '../src/app'

describe('Health Check', () => {
  it('should return OK', async () => {
    const app = await buildApp()

    const res = await app.inject({
      method: 'GET',
      url: '/health',
    })

    expect(res.statusCode).toBe(200)
  })
})