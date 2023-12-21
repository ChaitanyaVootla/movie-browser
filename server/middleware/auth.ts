import { getToken, getServerSession } from '#auth'

export default eventHandler(async (event) => {
  const userData = await getToken({ event })
  const session = await getServerSession(event);
  console.log(session, userData)
  event.context.userData = userData;
})
