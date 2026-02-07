import useSWR from 'swr'
import { apiCall } from '../../../shared/utils/api'
import { API } from '@/shared/api/constants'

export function useLayoutData(floor) {
  return useSWR(
    floor ? ['layout', floor] : null,
    async () => {
      const response = await apiCall(API.GET_TABLE_LAYOUT, { 
        floor 
      })
      return response
    },
    {
      revalidateOnFocus: false,
      revalidateOnReconnect: false
    }
  )
}
