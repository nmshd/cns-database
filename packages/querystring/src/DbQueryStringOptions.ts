import { StringOperations } from "./StringOperations";

export interface DbQueryStringOptions {
    ops?: string[];
    alias?: any;
    blacklist?: Record<string, boolean>;
    whitelist?: Record<string, boolean>;
    custom?: Record<string, (query: any, input: string) => void>;
    string?: StringOperations;
    keyRegex?: RegExp;
    valRegex?: RegExp;
    arrRegex?: RegExp;
}