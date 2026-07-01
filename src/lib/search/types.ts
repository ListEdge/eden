/**
 * Eden — Web search types.
 *
 * Provider-agnostic, exactly like place search and reasoning: callers depend on
 * `WebSearchProvider`, and a concrete provider (Tavily first) plugs in behind
 * it. Swapping to Brave/Serper/etc. later is a one-line env change.
 */

/** A request to search the web. */
export interface WebSearchQuery {
  /** The natural-language search query. */
  query: string;
  /** Maximum number of source results to return. */
  limit?: number;
}

/** A single web result. */
export interface WebSearchResult {
  title: string;
  url: string;
  /** A short extract of the page content relevant to the query. */
  snippet: string;
  /** Provider relevance score, when available (0–1). */
  score: number | null;
}

/** The outcome of a web search. */
export interface WebSearchResponse {
  /** A provider-synthesised direct answer, when available. */
  answer: string | null;
  results: WebSearchResult[];
}

/** A pluggable source of web-search data. */
export interface WebSearchProvider {
  readonly id: string;
  search(query: WebSearchQuery): Promise<WebSearchResponse>;
}

export type WebSearchProviderFactory = () => WebSearchProvider;
