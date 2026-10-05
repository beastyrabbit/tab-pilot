// Content is extracted directly by chromeContentApi. There is no local server bridge.

/**
 * Opens an SSE connection to the server's content bridge.
 * When the AI requests full page content for specific tabs,
 * this extracts the content and sends it back.
 *
 * Returns a cleanup function to close the connection.
 */
export function startContentBridge(): () => void {
	return () => {};
}
