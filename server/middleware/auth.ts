import { getToken } from '#auth'
import { JWT } from 'next-auth/jwt';
import { User } from "~/server/models";
import { getLocationFromEvent } from '../api/onLoad';

const ADMIN_EMAILS = ['speedblaze@gmail.com'];

export default eventHandler(async (event) => {
  const userData = await getToken({ event });
  event.context.userData = userData;
  if (userData?.sub) {
    if (ADMIN_EMAILS.includes(userData.email as string)) {
      event.context.isAdmin = true;
    }
    handleUserVisit(userData as JWT, getLocationFromEvent(event));
  }
})

const handleUserVisit = async (userData: JWT, location: any) => {
  if (!userData.sub) {
    console.error("Invalid user data:", userData);
    return;
  }

  try {
    await User.updateOne(
      { id: userData.sub },
      {
        $set: {
          ...userData,
          id: userData.sub,
          name: userData.name,
          email: userData.email,
          picture: userData.picture,
          lastVisited: new Date(),
          updatedAt: new Date(),
          location,
        },
        $setOnInsert: {
          createdAt: new Date(),
        },
      },
      { upsert: true }
    );
  } catch (err) {
    console.error(`Error processing user ${userData.name}:`, err);
  }
};
