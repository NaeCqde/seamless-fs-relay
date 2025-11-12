interface File_ {
	origin?: string;
	parent: string;
	name: string;
	size: number;
}

interface Payload {
	origin: string;
	files: File_[];
}

type Info = Omit<Payload, 'files'>;

export default {
	async fetch(req, env, context): Promise<Response> {
		if (req.headers.get('authorization') === env.TOKEN) {
			if (req.method === 'PUT') {
				const payload: Payload = await req.json();
				console.log('Registered: ' + payload.origin);
				console.log(payload);

				let origins = await loadOrigins(env.KV);
				const len = origins.length;
				const first = Boolean(new URL(req.url).searchParams.get('first'));
				const body = JSON.stringify(payload);
				const diff = body !== (await loadFiles(env.KV, payload.origin, true));

				if (first || diff) {
					for (const origin of origins) {
						if (payload.origin === origin) continue;

						try {
							const resp = await fetch(origin, {
								method: 'PUT',
								headers: {
									authorization: env.TOKEN,
									'content-type': 'application/json',
								},
								body,
							});

							if (!resp.ok) console.log(resp.status + '\n' + (await resp.text()));

							if (first) {
								console.log('First Registered: ' + payload.origin);

								const files = await loadFiles(env.KV, origin);
								const resp = await fetch(payload.origin, {
									method: 'PUT',
									headers: {
										authorization: env.TOKEN,
										'content-type': 'application/json',
									},
									body: JSON.stringify({ origin, files }),
								});

								if (!resp.ok) console.log(resp.status + '\n' + (await resp.text()));
							}
						} catch {
							origins = origins.filter((o) => o !== origin);
						}
					}
				}

				if (!origins.includes(payload.origin)) origins.push(payload.origin);
				if (len !== origins.length) {
					await saveOrigins(env.KV, origins);
				}
				if (diff) await saveFiles(env.KV, payload.origin, payload.files);
			} else if (req.method === 'DELETE') {
				const info: Info = await req.json();
				console.log('Deleted: ' + info.origin);

				let origins = await loadOrigins(env.KV);
				const len = origins.length;
				origins = (await loadOrigins(env.KV)).filter((o) => o !== info.origin);
				const body = JSON.stringify(info);

				for (const origin of origins) {
					try {
						await fetch(origin, {
							method: 'DELETE',
							headers: {
								authorization: env.TOKEN,
								'content-type': 'application/json',
							},
							body,
						});
					} catch {
						origins = origins.filter((o) => origin !== o);
					}
				}

				if (len !== origins.length) {
					await saveOrigins(env.KV, origins);
					await env.KV.delete(info.origin);
				}
			}

			return new Response(null);
		}

		return new Response(null, { status: 400 });
	},
} satisfies ExportedHandler<Env>;

export async function loadOrigins(kv: KVNamespace): Promise<string[]> {
	return JSON.parse((await kv.get('origins')) || '[]');
}
export function saveOrigins(kv: KVNamespace, origins: string[]) {
	return kv.put('origins', JSON.stringify(origins));
}

export async function loadFiles(kv: KVNamespace, origin: string, raw = false): Promise<string | File_[]> {
	const text = (await kv.get(origin)) || '[]';

	if (raw) {
		return text;
	} else {
		return JSON.parse(text);
	}
}
export function saveFiles(kv: KVNamespace, origin: string, files: File_[]) {
	return kv.put(origin, JSON.stringify(files));
}
