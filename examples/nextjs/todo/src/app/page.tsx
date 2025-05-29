import React from "react"
import { Shape, ShapeStream } from "@electric-sql/client"
import {
  createCollectionClient,
  dehydrateCollections,
} from "../lib/createCollectionClient"
import { CollectionHydrationBoundary } from "../lib/CollectionHydrationBoundary"
import TodoClient from "./TodoClient"
import type { UpdateConfig, UpdateTodo } from "../db/validation"

// Helper function to fetch initial shape data using Electric client
async function fetchInitialShapeData<T>(table: string): Promise<Array<T>> {
  const stream = new ShapeStream({
    url: `http://localhost:3003/v1/shape`,
    params: { table },
    subscribe: false, // Don't start live polling on server-side
  })

  const shape = new Shape(stream)

  // Get the initial data once it's loaded
  const shapeData = await shape.rows

  // Convert to array and return
  return shapeData as Array<T>
}

// Server component that prefetches data and creates dehydrated state
export default async function TodoPage() {
  // Fetch initial data directly from Electric SQL
  const fetchInitialData = async () => {
    try {
      // Fetch initial shape data for both tables
      const todosData = await fetchInitialShapeData<any>(`todos`)
      const configData = await fetchInitialShapeData<any>(`config`)

      // Process todos data into UpdateTodo objects
      const initialTodos: Array<UpdateTodo> = todosData.map((item: any) => ({
        id: parseInt(item.id),
        text: item.text,
        completed: item.completed === true || item.completed === `true`,
        created_at: new Date(item.created_at),
        updated_at: new Date(item.updated_at),
      }))

      // Process config data into UpdateConfig objects
      const initialConfig: Array<UpdateConfig> = configData.map(
        (item: any) => ({
          id: parseInt(item.id),
          key: item.key,
          value: item.value,
          created_at: new Date(item.created_at),
          updated_at: new Date(item.updated_at),
        })
      )

      return { initialTodos, initialConfig }
    } catch (error) {
      console.error(`Error fetching initial data:`, error)
      return { initialTodos: [], initialConfig: [] }
    }
  }

  const { initialTodos, initialConfig } = await fetchInitialData()

  // Create a temporary collection client to prefetch data (similar to React Query's prefetchQuery)
  const serverCollectionClient = createCollectionClient(
    initialTodos,
    initialConfig
  )

  // Dehydrate the collection state (similar to React Query's dehydrate)
  const dehydratedState = dehydrateCollections(serverCollectionClient)

  console.log(`initialTodos Server:`, initialTodos)
  console.log(`initialConfig:`, initialConfig)
  console.log(`dehydratedState:`, dehydratedState)

  return (
    <CollectionHydrationBoundary state={dehydratedState}>
      <TodoClient />
    </CollectionHydrationBoundary>
  )
}
