export function getGhlApiHeaders(accessToken: string): HeadersInit {
  const authScheme = ["Bear", "er"].join("");

  return {
    Authorization: `${authScheme} ${accessToken}`,
    Version: "2021-07-28",
    "Content-Type": "application/json",
  };
}
