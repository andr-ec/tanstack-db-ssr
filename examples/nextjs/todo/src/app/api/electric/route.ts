export async function GET(request: Request) {
  const url = new URL(request.url)

  // Log the User-Agent header to see who made the request
  const userAgent = request.headers.get(`user-agent`)
  console.log(`Electric SQL proxy request from:`, userAgent)
  // console.log(`Request URL:`, url.toString())
  // console.log(`Request params:`, Object.fromEntries(url.searchParams.entries()))

  // Construct the upstream URL to Electric SQL
  const originUrl = new URL(`http://localhost:3003/v1/shape`)

  // Copy over the relevant query params that the Electric client adds
  // so that we return the right part of the Shape log.
  url.searchParams.forEach((value, key) => {
    if ([`live`, `table`, `handle`, `offset`, `cursor`].includes(key)) {
      originUrl.searchParams.set(key, value)
    }
  })

  // console.log(`Proxying to Electric SQL:`, originUrl.toStrig())
  // console.log(
  //   `Upstream params:`,
  //   Object.fromEntries(originUrl.searchParams.entries())
  // )

  // Add 5 second delay to simulate network latency
  console.log(`Adding 5 second delay...`)
  await new Promise((resolve) => setTimeout(resolve, 5000))
  console.log(`Delay complete, forwarding request to Electric SQL`)

  //
  // Authentication and authorization
  //

  // For now, we'll allow all requests through
  // In a real app, you would:
  // const user = await loadUser(request.headers.get(`authorization`))
  // if (!user) {
  //   return new Response(`user not found`, { status: 401 })
  // }

  // Only query data the user has access to unless they're an admin.
  // if (!user.roles.includes(`admin`)) {
  //   originUrl.searchParams.set(`where`, `"org_id" = ${user.org_id}`)
  // }

  try {
    const response = await fetch(originUrl)

    // console.log(`Electric SQL response status:`, response.status)
    // console.log(
    //   `Electric SQL response headers:`,
    //   Object.fromEntries(response.headers.entries())
    // )

    // For error responses, log the body
    if (!response.ok) {
      const responseText = await response.text()
      // console.log(`Electric SQL error response:`, responseText)
      return new Response(responseText, {
        status: response.status,
        statusText: response.statusText,
        headers: response.headers,
      })
    }

    // Check if this is a live streaming request
    const isLiveRequest = url.searchParams.get(`live`) === `true`

    if (isLiveRequest) {
      // console.log(`Handling live streaming request`)

      // For live streaming, we need to return the response body as a stream
      // without waiting for it to complete
      const headers = new Headers(response.headers)
      headers.delete(`content-encoding`)
      headers.delete(`content-length`)

      return new Response(response.body, {
        status: response.status,
        statusText: response.statusText,
        headers,
      })
    } else {
      // For non-live requests, handle normally
      const headers = new Headers(response.headers)
      headers.delete(`content-encoding`)
      headers.delete(`content-length`)

      return new Response(response.body, {
        status: response.status,
        statusText: response.statusText,
        headers,
      })
    }
  } catch (error) {
    console.error(`Error proxying to Electric:`, error)
    return new Response(`Internal Server Error`, { status: 500 })
  }
}
