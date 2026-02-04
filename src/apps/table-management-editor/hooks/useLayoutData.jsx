import useSWR from 'swr'
import { apiCall } from '../../../shared/utils/api'

export function useLayoutData(floor) {
  return useSWR(
    floor ? ['layout', floor] : null,
    async () => {
      const response = await apiCall('imogi_pos.api.layout.get_table_layout', { 
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
