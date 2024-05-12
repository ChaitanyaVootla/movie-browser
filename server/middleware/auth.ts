import { getToken } from '#auth'
import { JWT } from 'next-auth/jwt';
import { User } from "~/server/models";

export default eventHandler(async (event) => {
  const userData = await getToken({ event });
  event.context.userData = userData;
  if (userData?.sub) {
    handleUserVist(userData as JWT);
  }
})

const handleUserVist = async (userData: JWT) => {
  const dbUser = await User.findOne({ id: userData.sub });
  if (!dbUser) {
    const newUser = new User({
      id: userData.sub,
      name: userData.name,
      email: userData.email,
      picture: userData.picture,
      createdAt: new Date(),
      updatedAt: new Date(),
      lastVisited: new Date(),
    });
    newUser.save().then(() => {
      console.log(`New user created ${userData.name}, ${userData.email}`);
    }).catch(() => {
      console.error(`New user creation error ${userData.name}`);
    });
  } else {
    dbUser?.updateOne({ lastVisited: new Date() }).then(() => {
    }).catch(() => {
      console.error(`User last vist update error ${userData.name}`);
    });
  }
}