"use client"

import * as React from "react"
import { useCollectionClient } from "./CollectionClientProvider"
import type { CollectionClient } from "./CollectionClientProvider"

export interface DehydratedCollectionState {
  [collectionKey: string]: Array<any>
}

export interface CollectionHydrationBoundaryProps {
  state?: DehydratedCollectionState
  children?: React.ReactNode
  collectionClient?: CollectionClient
}

export const CollectionHydrationBoundary = ({
  children,
  state,
  collectionClient,
}: CollectionHydrationBoundaryProps) => {
  const client = useCollectionClient(collectionClient)
  const [hydrationQueue, setHydrationQueue] = React.useState<
    DehydratedCollectionState | undefined
  >()

  React.useMemo(() => {
    if (state) {
      if (typeof state !== `object`) {
        return
      }

      const newData: DehydratedCollectionState = {}
      const existingData: DehydratedCollectionState = {}
      const clientCollections = client.getAllCollections()

      Object.entries(state).forEach(([collectionKey, data]) => {
        const collection = clientCollections[collectionKey]

        const hasExistingData = collection.state.size > 0
        if (!hasExistingData) {
          newData[collectionKey] = data
        } else {
          existingData[collectionKey] = data
        }
      })

      if (Object.keys(newData).length > 0) {
        hydrateCollections(client, newData)
      }

      if (Object.keys(existingData).length > 0) {
        setHydrationQueue((prev) => ({
          ...prev,
          ...existingData,
        }))
      }
    }
  }, [client, state])

  React.useEffect(() => {
    if (hydrationQueue) {
      hydrateCollections(client, hydrationQueue)
      setHydrationQueue(undefined)
    }
  }, [client, hydrationQueue])

  return children as React.ReactElement
}

// Helper function to hydrate collections with data
function hydrateCollections(
  client: CollectionClient,
  data: DehydratedCollectionState
) {
  const clientCollections = client.getAllCollections()

  Object.entries(data).forEach(([collectionKey, items]) => {
    const collection = clientCollections[collectionKey]

    collection.syncedData.setState((prevData) => {
      const newData = new Map(prevData)
      items.forEach((item: any) => {
        const key = `${collectionKey}-${item.id}`
        newData.set(key, item)
        collection.objectKeyMap.set(item, key)
      })
      return newData
    })
  })
}
