import { getToken } from '#auth'

export default eventHandler(async (event) => {
  const userData = await getToken({ event });
  event.context.userData = userData;
})
