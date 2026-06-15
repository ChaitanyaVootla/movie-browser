import { z } from "zod";
import { DiscussionAnchorSchema } from "@/server/services/discussion/comment-schemas";

export const GetAnchorActivitySchema = z.object({ anchor: DiscussionAnchorSchema });
export const MarkAnchorReadSchema = z.object({ anchor: DiscussionAnchorSchema });
