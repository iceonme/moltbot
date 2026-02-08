export const defaultConfigTemplate = `{
  gateway: {
    mode: "local",
    bind: "loopback",
    port: 18789,
    auth: {
      mode: "token",
      token: "${'{CLAWDBOT_GATEWAY_TOKEN}'}"
    }
  },
  env: {
    OPENROUTER_API_KEY: "${'{OPENROUTER_API_KEY}'}"
  },
  agents: {
    defaults: {
      model: {
        primary: "openrouter/deepseek/deepseek-r1:free"
      }
    }
  }
}
`;
