import { NuxtAuthHandler } from '#auth'
import GoogleProvider from 'next-auth/providers/google'
import CredentialsProvider from 'next-auth/providers/credentials'

export default NuxtAuthHandler({
    secret: process.env.AUTH_SECRET,
    providers: [
        // @ts-ignore
        GoogleProvider.default({
            clientId: process.env.GOOGLE_AUTH_CLIENT_ID,
            clientSecret: process.env.GOOGLE_AUTH_CLIENT_SECRET,
        }),
        // @ts-ignore
        CredentialsProvider.default({
            id: 'google-one-tap',
            name: 'Google One Tap',
            credentials: {
                credential: { type: 'text' },
            },
            async authorize(credentials: any) {
                try {
                    // Verify the Google One Tap token
                    const response = await fetch(
                        `https://oauth2.googleapis.com/tokeninfo?id_token=${credentials.credential}`
                    );
                    const tokenInfo = await response.json();

                    if (tokenInfo.error) {
                        console.error('Google token verification failed:', tokenInfo.error);
                        return null;
                    }

                    // Verify the audience (client ID)
                    if (tokenInfo.aud !== process.env.GOOGLE_AUTH_CLIENT_ID) {
                        console.error('Invalid audience in token');
                        return null;
                    }

                    // Return user object compatible with NextAuth
                    return {
                        id: tokenInfo.sub,
                        name: tokenInfo.name,
                        email: tokenInfo.email,
                        image: tokenInfo.picture,
                    };
                } catch (error) {
                    console.error('Error verifying Google One Tap token:', error);
                    return null;
                }
            },
        })
    ]
})
