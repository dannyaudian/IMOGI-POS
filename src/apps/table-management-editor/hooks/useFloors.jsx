import useSWR from 'swr'
import { apiCall } from '../../../shared/utils/api'
import { API } from '@/shared/api/constants'

export function useFloors(branch) {
  return useSWR(
    branch ? ['floors', branch] : null,
    async () => {
      const response = await apiCall(API.GET_FLOORS)
      return response || []
    },
    {
      revalidateOnFocus: false,
      revalidateOnReconnect: false
    }
  )
}
