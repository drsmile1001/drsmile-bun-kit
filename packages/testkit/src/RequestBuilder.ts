import type { BodyInit } from "bun";

export class RequestBuilder {
  private method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE" = "GET";
  private path: string;
  private query: Record<string, string | string[]> = {};
  private cookies: Record<string, string> = {};
  private body?:
    | ReadableStream
    | Blob
    | FormData
    | URLSearchParams
    | string
    | null
    | undefined;
  private contentType?: string | null = null;

  constructor(path: string) {
    this.path = path;
  }

  setMethod(method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE") {
    this.method = method;
    return this;
  }

  withQuery(query: Record<string, string | string[]>) {
    this.query = { ...this.query, ...query };
    return this;
  }

  withCookies(cookies: Record<string, string>) {
    this.cookies = { ...this.cookies, ...cookies };
    return this;
  }

  withCookie(key: string, value: string) {
    this.cookies[key] = value;
    return this;
  }

  withBody(
    body:
      | ReadableStream
      | Blob
      | FormData
      | URLSearchParams
      | string
      | null
      | undefined
  ) {
    this.body = body;
    return this;
  }

  withContentType(contentType: string) {
    this.contentType = contentType;
    return this;
  }

  asRequest(): Request {
    const url = new URL(`http://localhost${this.path}`);
    for (const [key, value] of Object.entries(this.query)) {
      if (Array.isArray(value)) {
        value.forEach((v) => url.searchParams.append(key, v));
      } else {
        url.searchParams.append(key, value);
      }
    }

    const headers = new Headers();
    if (this.cookies && Object.keys(this.cookies).length > 0) {
      const cookieStr = Object.entries(this.cookies)
        .map(([k, v]) => `${k}=${v}`)
        .join("; ");
      headers.set("Cookie", cookieStr);
    }

    if (this.contentType) {
      headers.set("Content-Type", this.contentType);
    }

    return new Request(url.toString(), {
      method: this.method,
      body: this.body,
      headers,
    });
  }
}

export function httpGet(path: string) {
  return new RequestBuilder(path);
}

export function httpPost<T extends FormData>(
  path: string,
  type: "MULTIPART",
  body: T
): RequestBuilder;
export function httpPost<T extends Record<string, string>>(
  path: string,
  type: "FORM",
  body: T
): RequestBuilder;
export function httpPost<T>(
  path: string,
  type: "JSON",
  body: T
): RequestBuilder;
export function httpPost<T>(path: string, body?: T): RequestBuilder;
export function httpPost(
  path: string,
  arg1: unknown,
  arg2?: unknown
): RequestBuilder {
  if (arg1 === "MULTIPART" && arg2 instanceof FormData) {
    return new RequestBuilder(path)
      .setMethod("POST")
      .withBody(arg2 as FormData); // ⚠️ 不設 Content-Type，瀏覽器自動處理
  }
  if (arg1 === "FORM" && arg2 && typeof arg2 === "object") {
    const formData = new URLSearchParams();
    for (const [key, value] of Object.entries(arg2 as Record<string, string>)) {
      formData.append(key, value);
    }
    return new RequestBuilder(path)
      .setMethod("POST")
      .withBody(formData.toString())
      .withContentType("application/x-www-form-urlencoded");
  }

  if (arg1 === "JSON" && arg2) {
    return new RequestBuilder(path)
      .setMethod("POST")
      .withBody(JSON.stringify(arg2))
      .withContentType("application/json");
  }

  if (arg1 === undefined) {
    return new RequestBuilder(path).setMethod("POST");
  }

  return new RequestBuilder(path)
    .setMethod("POST")
    .withBody(JSON.stringify(arg1))
    .withContentType("application/json");
}

export function httpPut<T>(path: string, body?: T) {
  if (body === undefined) {
    return new RequestBuilder(path).setMethod("PUT");
  }
  return new RequestBuilder(path)
    .setMethod("PUT")
    .withBody(JSON.stringify(body))
    .withContentType("application/json");
}

export function httpPatch<T>(path: string, body: T) {
  return new RequestBuilder(path)
    .setMethod("PATCH")
    .withBody(JSON.stringify(body))
    .withContentType("application/json");
}

export function httpDelete(path: string) {
  return new RequestBuilder(path).setMethod("DELETE");
}
