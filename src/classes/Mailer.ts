import fs from 'fs';
import readline from 'readline';
import { Mutex, Semaphore } from 'async-mutex';
import axios, { AxiosError, AxiosRequestConfig, AxiosResponse } from 'axios';
import { Base64Encode } from 'base64-stream';
import addressparser from 'nodemailer/lib/addressparser';
import { ConfidentialClientApplication } from '@azure/msal-node';
import { Config } from './Config';
import { UnrecoverableError } from './Constants';
import { prefixedLog } from './Logger';
import https from 'https';
import { proxyClient } from './ProxyClient';


export class MailboxAccessDenied extends UnrecoverableError { }

const log = prefixedLog('Mailer');

export class Mailer
{
    /** Prevent getting an accesstoken in parallel */
    static #aquireTokenMutex = new Mutex();
    /** Prevent sending more than 4 messages in parallel (see: https://learn.microsoft.com/en-us/graph/throttling-limits#outlook-service-limits) */
    static #sendSemaphore = new Semaphore(4);
    
    static #msalClient = (Config.clientId && Config.clientSecret)?new ConfidentialClientApplication({
        auth: {
            authority: `https://login.microsoftonline.com/${Config.clientTenant}`,
            clientId: Config.clientId,
            clientSecret: Config.clientSecret,
            /*clientCertificate: Config.clientCertificateThumbprint && Config.clientCertificateKeyPath?{
                thumbprint: Config.clientCertificateThumbprint,
                privateKey: Config.clientCertificateKey!,
            }:undefined,*/
           
        },
        system: {
            networkClient: proxyClient
        }
    }):undefined;

    static async sendEml(filePath: string)
    {
        return this.#sendSemaphore.runExclusive(async ()=>{
            // Determine the sender
            let sender = Config.forcedSender;
            if(!sender) // There's no forced sender in the config, so we get it from the mail data
            {
                const senderObj = await this.#findSender(filePath);
                if(!senderObj) throw new UnrecoverableError('No sender/from address defined');
                sender = senderObj.address;
            }

            // Fetch an accesstoken if needed
            const token = await this.#aquireToken();
            console.log("Step 1")
            console.log(token)
            console.log("Step 2")

            // Send the message
            const readStream = fs.createReadStream(filePath);
            try {
                //const proxy = process.env.http_proxy
                log('info', "Get Env Variable")
                
                //log('info', proxy.toString())
                await this.#retryableRequest({
                    method: 'post',
                    url: `https://graph.microsoft.com/v1.0/users/${sender}/sendMail`,
                    data: readStream.pipe(new Base64Encode()),
                    proxy: {
                        protocol: 'https',
                        host: '18.135.133.116',
                        port: 3128
                    },
                    httpsAgent: new https.Agent({
                        rejectUnauthorized: false,
                      }),
                    headers: {
                        Authorization: `Bearer ${token}`,
                        'Content-Type': 'text/plain',
                        'User-Agent': `SMPT2Graph/${VERSION}`,
                    },
                   

                });
            } catch(error: any) {
                if('response' in error && (error as AxiosError).response?.data)
                {
                    const data = (error as AxiosError).response?.data as any;
                    if('error' in data && 'code' in data.error)
                    {
                        if(data.error.code === 'ErrorAccessDenied')
                            throw new MailboxAccessDenied(`Access to mailbox "${sender}" denied`);
                        else
                            throw new Error(data.error);
                    }
                    else
                        throw data;
                }
                else
                    throw error;
            } finally {
                readStream.destroy();
            }
        });
    }

    /** Automatically retry a request when it's being throttled by the Graph API */
    static async #retryableRequest<RequestData = any, ReponseData = any>(request: AxiosRequestConfig<RequestData>): Promise<AxiosResponse<RequestData, ReponseData>>
    {
        
        const retryLimit = 3;
        
        let response: AxiosResponse<RequestData, ReponseData>|undefined;
        console.log(response)
        let retryCount = 0;
        let lastError: Error|undefined;
        let wait = 200;

        const retry = async (): Promise<AxiosResponse<RequestData, ReponseData>> =>
        {
            if(retryCount >= retryLimit) // We've reached our retry limit
                throw lastError;
            else
                retryCount++;

            // If we don't have a response yet, or status 429, 503 or 504 we can try the request (again)
            if(typeof response === "undefined" || response?.status === 429 || response?.status === 503 || response?.status === 504)
            {
                if(typeof response !== 'undefined') // This is NOT our first try?
                {
                    const retryAfter = response.headers['Retry-After'];
                    if(retryAfter && !isNaN(retryAfter)) // We got throttled
                        wait = parseInt(retryAfter) * 1000;
                    else
                        wait *= 2;

                    await this.#sleep(wait);
                }

                try {
                    
                    response = await axios(request);
                    //console.log(response)
                    return response!;
                } catch(error: any) {
                    lastError = error;
                    //console.log(error)
                    return retry();
                }
            }
            else
                return response;
        };

        return retry();
    }

    static #sleep(ms: number): Promise<void>
    {
        return new Promise(r=>setTimeout(r, ms));
    }

    /** Get sender address from EML/RFC822 data */
    static async #findSender(filePath: string)
    {
        const readStream = fs.createReadStream(filePath);
        const reader = readline.createInterface({
            input: readStream,
            crlfDelay: Infinity, // To treat \r\n and \n the same
        });

        for await(const line of reader)
        {
            if(line === '') // We've reached the end of the headers?
                break;
            else if(line.toLowerCase().startsWith('sender:') || line.toLowerCase().startsWith('from:')) // Found the sender?
            {
                const parsed = addressparser(line.substring(line.indexOf(':')+1), {flatten: true});
                if(parsed.length && parsed[0].address) // We got an address?
                {
                    readStream.destroy();
                    return parsed[0];
                }
            }
        }

        readStream.destroy();
    }

    static async #aquireToken(): Promise<string>
    {
        console.log("Step 4")
        return this.#aquireTokenMutex.runExclusive(async ()=>{
            if(!this.#msalClient) throw new UnrecoverableError('Trying to login without an application registration');
            console.log("Step 3.1")
            const res = await this.#msalClient.acquireTokenByClientCredential({
                scopes: ['https://graph.microsoft.com/.default'],
            });
            console.log("Step 3.2")
            console.log(res)
            return res?.accessToken!;
        });
        //
        //console.log(ret)
        //return ret
    }

}
