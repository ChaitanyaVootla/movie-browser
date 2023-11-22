import { IGetUserAuthInfoRequest } from '@/auth/utils';
import { Application } from 'express-serve-static-core';
import { Db } from 'mongodb';
import OpenAI from 'openai';
import { Movie, MovieLightFileds } from "@/db/schemas/Movies";

const setupRoute = (app: Application, db: Db) => {
    app.get('/assistant', async (req: IGetUserAuthInfoRequest, res) => {
        try {
            if (!req.isAuthenticated || !req.query.message) {
                return res.json({error: 'unauthorized or no message provided'});
            }
            const ai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
            let threadId = req.query.threadId as string;
            if (!threadId) {
                const thread = await ai.beta.threads.create();
                console.log(`thread with id ${thread.id} created`);
                threadId = thread.id;
            }
            const message = await ai.beta.threads.messages.create(
                threadId,
                {
                    role: 'user',
                    content: req.query.message as string
                }
            );
            const run = await ai.beta.threads.runs.create(
                threadId,
                {
                    assistant_id: 'asst_eJnGJPjctAqeKtPqB6bH1xlZ',
                }
            );
            await waitForAiRun(ai, threadId, run.id);
            const messages = await ai.beta.threads.messages.list(threadId);
            const assistantResponse = (messages?.data[0]?.content[0] as any)?.text.value;

            const pasrsedResponse = convertResponseToJSON(assistantResponse);
            // let pasrsedResponse = {} as any;
            // try {
            //     pasrsedResponse = JSON.parse(assistantResponse);
            // } catch(e) {
            //     console.log(e);
            //     pasrsedResponse = e;
            // }
            const finalResponse = {
                preText: pasrsedResponse.preText,
                movieSuggestions: [],
                postText: pasrsedResponse.postText,
            };
            for (const movieSuggestion of pasrsedResponse.movieSuggestions) {
                const movie = await Movie.findOne({ id: movieSuggestion.id }).select(MovieLightFileds)
                if (movie) {
                    finalResponse.movieSuggestions.push(movie);
                }
            }
            res.json({
                text: finalResponse,
                assistantResponse,
                pasrsedResponse,
                threadId,
            });
        } catch(e) {
            res.json({error: e});
            console.log(e);
        }
    });
}

const waitForAiRun = (ai: OpenAI, threadId: string, runId: string): Promise<any> => {
    return new Promise((resolve, reject) => {
        const interval = setInterval(async () => {
            const run = await ai.beta.threads.runs.retrieve(threadId, runId);
            console.log(`run with id ${run.id}, status is ${run.status}`);
            if (run.status === 'completed') {
                clearInterval(interval);
                resolve(run);
            } else if ((run.status !== 'in_progress') && (run.status !== 'queued')) {
                reject(run);
            }
        }, 1000);
    });
}

function convertResponseToJSON(inputText) {
    const jsonStart = inputText.indexOf('{');
    const jsonEnd = inputText.lastIndexOf('}');
    const json = inputText.substring(jsonStart, jsonEnd + 1);
    let parsedJson = {} as any;
    try {
        parsedJson = JSON.parse(json);
    } catch(e) {
        console.log(e);
        parsedJson = e;
    }
    return parsedJson;
}

export {setupRoute as default};
