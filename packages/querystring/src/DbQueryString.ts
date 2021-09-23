import { DbQueryStringOptions } from "./DbQueryStringOptions";
import { StringOperations } from "./StringOperations";

export class DbQueryString {
    private static defaultKeyRegex = /^[A-z_@][A-z@0-9-_]*(\.[A-z_@][A-z@0-9-_]*)*$/;
    private static defaultValRegex?: RegExp = undefined;
    private static defaultArrRegex = /^[a-zæøå0-9-_.]+(\[])?$/i;

    private readonly ops: string[];
    private readonly alias: any;
    private readonly blacklist: Record<string, boolean>;
    private readonly whitelist: Record<string, boolean>;
    private readonly custom: Record<string, Function>;
    private readonly string: StringOperations;

    private readonly keyRegex: RegExp;
    private readonly valRegex?: RegExp;
    private readonly arrRegex: RegExp;

    public constructor(options: DbQueryStringOptions = {}) {
        this.ops = options.ops ?? ["!", "^", "$", "~", ">", "<", "$in"];
        this.alias = options.alias ?? {};
        this.blacklist = options.blacklist ?? {};
        this.whitelist = options.whitelist ?? {};
        this.custom = options.custom ?? {};

        options.string = options.string ?? {};
        this.string = options.string;
        this.string.toBoolean = typeof options.string.toBoolean === "boolean" ? options.string.toBoolean : true;
        this.string.toNumber = typeof options.string.toNumber === "boolean" ? options.string.toNumber : true;

        this.keyRegex = options.keyRegex ?? DbQueryString.defaultKeyRegex;
        this.valRegex = options.valRegex ?? DbQueryString.defaultValRegex;
        this.arrRegex = options.arrRegex ?? DbQueryString.defaultArrRegex;
    }

    public static setDefaultKeyRegex(regex: RegExp): void {
        DbQueryString.defaultKeyRegex = regex;
    }

    public static setDefaultValRegex(regex: RegExp): void {
        DbQueryString.defaultValRegex = regex;
    }

    public static setDefaultArrRegex(regex: RegExp): void {
        DbQueryString.defaultArrRegex = regex;
    }

    public parseString(string: string, array?: boolean): any {
        let op = string[0] || "";
        const eq = string[1] === "=";
        let org = string.substr(eq ? 2 : 1) || "";
        const val = this.parseStringVal(org);

        const ret: any = { op, org, value: val };

        switch (op) {
            case "!":
                if (array) {
                    ret.field = "$nin";
                } else if (org === "") {
                    ret.field = "$exists";
                    ret.value = false;
                } else {
                    ret.field = "$ne";
                }
                break;
            case ">":
                ret.field = eq ? "$gte" : "$gt";
                break;
            case "<":
                ret.field = eq ? "$lte" : "$lt";
                break;
            case "^":
            case "$":
            case "~":
                ret.field = "$regex";
                ret.options = "i";
                ret.value = this.valRegex ? org.replace(this.valRegex, "") : ret.value.toString();

                switch (op) {
                    case "^":
                        ret.value = `^${val}`;
                        break;
                    case "$":
                        ret.value = `${val}$`;
                        break;
                    default:
                        break;
                }
                break;
            default:
                ret.org = org = op + org;
                ret.op = op = "";
                ret.value = this.parseStringVal(org);

                if (array) {
                    ret.field = "$in";
                } else if (org === "") {
                    ret.field = "$exists";
                    ret.value = true;
                } else {
                    ret.field = "$eq";
                }
        }

        ret.parsed = {};
        ret.parsed[ret.field] = ret.value;

        if (ret.options) {
            ret.parsed.$options = ret.options;
        }

        return ret;
    }

    public parseStringVal(string: string): string | number | boolean {
        if (this.string.toBoolean && string.toLowerCase() === "true") {
            return true;
        } else if (this.string.toBoolean && string.toLowerCase() === "false") {
            return false;
        } else if (this.string.toNumber && !isNaN(parseInt(string, 10)) && +string - +string + 1 >= 0) {
            return parseFloat(string);
        }

        return string;
    }

    public parse(query?: any): any {
        if (!query) {
            return {};
        }

        const res: any = {};

        for (let key of Object.keys(query)) {
            const val = query[key];

            // Normalize array keys
            if (Array.isArray(val)) {
                key = key.replace(/\[]$/, "");
            }

            // Ignore not whitelisted keys
            if (Object.keys(this.whitelist).length && !this.whitelist[key]) {
                continue;
            }

            // Remove blacklisted keys
            if (this.blacklist[key]) {
                continue;
            }

            // Use aliases
            if (this.alias[key]) {
                key = this.alias[key];
            }

            // Handle string key
            if (typeof val === "string" && !this.keyRegex.test(key)) {
                continue;
                // Handle array key
            } else if (Array.isArray(val) && !this.arrRegex.test(key)) {
                continue;
            }

            // Apply custom functions
            if (typeof this.custom[key] === "function") {
                this.custom[key].apply(null, [res, val]);
                continue;
            }

            // Handle array key
            if (Array.isArray(val)) {
                if (this.ops.includes("$in") && val.length > 0) {
                    res[key] = {};

                    for (const item of val) {
                        if (this.ops.includes(item[0])) {
                            const parsed = this.parseString(item, true);

                            switch (parsed.field) {
                                case "$in":
                                case "$nin":
                                    res[key][parsed.field] = res[key][parsed.field] || [];
                                    res[key][parsed.field].push(parsed.value);
                                    break;
                                case "$regex":
                                    res[key].$regex = parsed.value;
                                    res[key].$options = parsed.options;
                                    break;
                                default:
                                    res[key][parsed.field] = parsed.value;
                            }
                        } else {
                            res[key].$in = res[key].$in || [];
                            res[key].$in.push(this.parseStringVal(item));
                        }
                    }
                }

                continue;
            }

            // `val` must be a string
            if (typeof val !== "string") {
                continue;
            }

            // Field exists query
            if (!val) {
                res[key] = { $exists: true };

                // Query operators
            } else if (this.ops.includes(val[0])) {
                res[key] = this.parseString(val).parsed;

                // Equal operator (no operator)
            } else {
                res[key] = this.parseStringVal(val);
            }
        }

        return res;
    }
}
