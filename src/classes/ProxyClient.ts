//This is the implementation of the networkClient that works through the proxy without any issues
import { Config } from './Config';
import fetch from 'node-fetch';
import { HttpsProxyAgent } from 'https-proxy-agent';

export const proxyAgent = new HttpsProxyAgent(Config.proxyUrl);

export const proxyClient = {
  async sendGetRequestAsync(
      url: string,
      options?: any
  ): Promise<any> {
    const response = await fetch(url, { agent: proxyAgent, ...options });
    const json = await response.json();
    const headers = response.headers.raw();
    const obj = {
      headers: Object.create(Object.prototype, headers),
      body: json,
      status: response.status,
    };
    return obj;
  },

  async sendPostRequestAsync(
      url: string,
      options?: any,
      cancellationToken?: number
  ): Promise<any> {
    const sendingOptions = options || {};
    sendingOptions.method = 'post';
    const response = await fetch(url, { agent: proxyAgent, ...sendingOptions });
    const json = await response.json();
    const headers = response.headers.raw();
    const obj = {
      headers: Object.create(Object.prototype, headers),
      body: json,
      status: response.status,
    };
    return obj;
  }
};


