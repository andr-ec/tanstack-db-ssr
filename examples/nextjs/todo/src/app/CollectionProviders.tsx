"use client"

import * as React from "react"
import { createCollectionClient } from "../lib/createCollectionClient"
import { CollectionClientProvider } from "../lib/CollectionClientProvider"

export function CollectionProviders({
  children,
}: {
  children: React.ReactNode
}) {
  // Create a collection client instance (similar to QueryClient)
  // This ensures that data is not shared between different users and requests
  const [collectionClient] = React.useState(() =>
    createCollectionClient([], [], {
      defaultOptions: {
        // With SSR, we usually want to set some default staleTime
        // above 0 to avoid refetching immediately on the client
        staleTime: 60 * 1000,
      },
    })
  )

  return (
    <CollectionClientProvider client={collectionClient}>
      {children}
    </CollectionClientProvider>
  )
}
