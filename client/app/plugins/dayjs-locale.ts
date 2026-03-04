import dayjs from 'dayjs'
import 'dayjs/locale/pt-br'

export default defineNuxtPlugin(() => {
  dayjs.locale('pt-br')
})
