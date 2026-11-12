import { RelaySigner } from './sign';

export type Outcome = 'ok' | 'refused' | 'unreachable';

const TIMEOUT_MS = 5000;

/** Sends a signed call to a server. `unreachable` means that nothing answered (the server is gone); `refused` that it answered with an error. */
export async function push(signer: RelaySigner, target: string, method: 'PUT' | 'DELETE', body: string): Promise<Outcome> {
	try {
		const response = await fetch(target + '/', {
			method,
			headers: await signer.headers(method, target, body),
			body,
			// a server cannot send the relay somewhere else with a redirect
			redirect: 'manual',
			signal: AbortSignal.timeout(TIMEOUT_MS),
		});
		if (response.ok) return 'ok';
		console.log(`${method} ${target}: ${response.status}`);
		return 'refused';
	} catch (e) {
		console.log(`${method} ${target}: ${e instanceof Error ? e.message : e}`);
		return 'unreachable';
	}
}
