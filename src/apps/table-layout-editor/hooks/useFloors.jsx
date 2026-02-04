import useSWR from 'swr'
import { apiCall } from '../../../shared/utils/api'

export function useFloors(branch) {
  return useSWR(
    branch ? ['floors', branch] : null,
    async () => {
      const response = await apiCall('imogi_pos.api.layout.get_floors')
      return response || []
    },
    {
      revalidateOnFocus: false,
      revalidateOnReconnect: false
    }
  )
}
