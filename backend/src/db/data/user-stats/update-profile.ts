import type { UGGUpdatePlayerProfileResponse } from './types';

const UGG_API_URL = 'https://u.gg/api';

const UPDATE_PLAYER_PROFILE_QUERY = `
query UpdatePlayerProfile($regionId: String!, $riotUserName: String!, $riotTagLine: String!) {
  updatePlayerProfile(
    regionId: $regionId
    riotUserName: $riotUserName
    riotTagLine: $riotTagLine
  ) {
    success
    errorReason
    __typename
  }
}
`;

export interface UpdatePlayerProfileParams {
  riotUserName: string;
  riotTagLine: string;
  regionId: string;
}

/**
 * Trigger the U.GG UpdatePlayerProfile mutation to refresh player data
 */
export async function updatePlayerProfile(
  params: UpdatePlayerProfileParams
): Promise<UGGUpdatePlayerProfileResponse['data']['updatePlayerProfile']> {
  const { riotUserName, riotTagLine, regionId } = params;

  const requestBody = {
    operationName: 'UpdatePlayerProfile',
    variables: {
      regionId,
      riotUserName,
      riotTagLine,
    },
    query: UPDATE_PLAYER_PROFILE_QUERY.trim(),
  };

  const headers: Record<string, string> = {
    accept: '*/*',
    'accept-language': 'en-US,en;q=0.9',
    'content-type': 'application/json',
    dnt: '1',
    origin: 'https://u.gg',
    referer: 'https://u.gg/',
    'user-agent':
      process.env.UGG_USER_AGENT ||
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
    'x-app-type': 'web',
    'x-app-version':
      process.env.UGG_APP_VERSION ||
      'f19ef17776311e1e8049787672463eb2766e629a',
  };

  const cookie = process.env.UGG_COOKIE;
  if (cookie) {
    headers.cookie = cookie;
  } else {
    console.warn('⚠️ UGG_COOKIE not set; UpdatePlayerProfile may fail if authentication is required.');
  }

  const response = await fetch(UGG_API_URL, {
    method: 'POST',
    headers,
    body: JSON.stringify(requestBody),
  });

  if (!response.ok) {
    throw new Error(`U.GG UpdatePlayerProfile failed: ${response.status} ${response.statusText}`);
  }

  const json = (await response.json()) as UGGUpdatePlayerProfileResponse;
  const result = json?.data?.updatePlayerProfile;

  if (!result) {
    throw new Error('U.GG UpdatePlayerProfile returned an unexpected response shape');
  }

  return result;
}

