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

  // This useMemo is for performance reasons only, everything inside it must
  // be safe to run in every render and code here should be read as "in render".
  //
  // This code needs to happen during the render phase, because after initial
  // SSR, hydration needs to happen _before_ children render. Also, if hydrating
  // during a transition, we want to hydrate as much as is safe in render so
  // we can prerender as much as possible.
  React.useMemo(() => {
    if (state) {
      if (typeof state !== `object`) {
        return
      }

      const newData: DehydratedCollectionState = {}
      const existingData: DehydratedCollectionState = {}
      const clientCollections = client.getAllCollections()

      // Check each collection in the dehydrated state
      Object.entries(state).forEach(([collectionKey, data]) => {
        const collection = clientCollections[collectionKey]

        const hasExistingData = collection.state.size > 0
        if (!hasExistingData) {
          newData[collectionKey] = data
        } else {
          // For existing collections, queue the hydration for after render
          existingData[collectionKey] = data
        }
      })

      // Immediately hydrate new collections
      if (Object.keys(newData).length > 0) {
        hydrateCollections(client, newData)
      }

      // Queue existing collections for hydration after render
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
  console.log(`Hydrating collections with data:`, data)

  const clientCollections = client.getAllCollections()

  Object.entries(data).forEach(([collectionKey, items]) => {
    const collection = clientCollections[collectionKey]

    console.log(
      `Hydrating ${collectionKey} collection with`,
      items.length,
      `items`
    )

    // Write directly to the collection's syncedData store
    collection.syncedData.setState((prevData) => {
      const newData = new Map(prevData)
      items.forEach((item: any) => {
        // Generate a key for each item using the collection key and item id
        const key = `${collectionKey}-${item.id}`
        newData.set(key, item)
        // Update the object key mapping so the collection can track objects
        collection.objectKeyMap.set(item, key)
      })
      return newData
    })
  })
}
