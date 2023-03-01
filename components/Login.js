import { useState, useEffect } from 'react';
import { useAppDispatch } from '../context/AppContext';
import { ethers } from 'ethers';
import { LitNodeClient } from '@lit-protocol/lit-node-client';
import {
  startRegistration,
  startAuthentication,
  browserSupportsWebAuthn,
  browserSupportsWebAuthnAutofill,
} from '@simplewebauthn/browser';
import base64url from 'base64url';
import {
  getWebAuthnAuthMethodId,
  getDefaultAuthNeededCallback,
  getPKPPublicKeyByWebAuthnId,
} from '../utils/helpers';
import { AuthMethodTypes } from '../utils/constants';
import { parseAuthenticatorData } from '../utils/webauthn/parseAuthenticatorData';
import { decodeAttestationObject } from '../utils/webauthn/decodeAttestationObject';
import cbor from 'cbor';
import Footer from './Footer';

const relayServerUrl =
  process.env.NEXT_PUBLIC_RELAY_API_URL || 'http://localhost:3001';
const relayApiKey = process.env.NEXT_PUBLIC_RELAY_API_KEY;

const LoginViews = {
  SIGN_UP: 'sign_up',
  SIGN_IN: 'sign_in',
  REGISTERING: 'registering',
  AUTHENTICATE: 'authenticate',
  AUTHENTICATING: 'authenticating',
  MINTING: 'minting',
  MINTED: 'minted',
  CREATING_SESSION: 'creating_session',
  SESSION_CREATED: 'session_created',
  ERROR: 'error',
};

export default function Login() {
  // App dispatch
  const dispatch = useAppDispatch();

  // For UI
  const [view, setView] = useState(LoginViews.SIGN_UP);
  const [errorMsg, setErrorMsg] = useState(null);

  // Current user
  const [username, setUsername] = useState('');
  const [webAuthnCredentialPublicKey, setWebAuthnCredentialPublicKey] =
    useState(null);

  // Update view if error has occured
  function setError(msg) {
    setErrorMsg(msg);
    setView(LoginViews.ERROR);
  }

  // Register WebAuthn credential
  async function register(event) {
    event.preventDefault();

    // Check if username is set
    if (!username) {
      const noUsernameErr = new Error('Passkey name is required');
      console.error(noUsernameErr);
      setError(noUsernameErr.message);
      return;
    }

    // Generate registration options for the browser to pass to a supported authenticator
    let publicKeyCredentialCreationOptions = null;

    try {
      const optionsRes = await fetch(
        `${relayServerUrl}/generate-registration-options?username=${username}`,
        {
          method: 'GET',
          headers: {
            'api-key': relayApiKey,
          },
        }
      );
      if (optionsRes.status < 200 || optionsRes.status >= 400) {
        const relayErr = new Error(
          'Something went wrong with our server. Please try again.'
        );
        console.error('Relay server error: ', optionsRes);
        setError(relayErr.message);
        return;
      }

      // Pass the options to the authenticator and wait for a response
      publicKeyCredentialCreationOptions = await optionsRes.json();
    } catch (e) {
      console.error(e);
      setError('Something went wrong with our server. Please try again.');
      return;
    }

    try {
      setView(LoginViews.REGISTERING);

      // Submit registration options to the authenticator
      const attResp = await startRegistration(
        publicKeyCredentialCreationOptions
      );
      // console.log('attResp', attResp);

      // Send the credential to the relying party for verification
      let verificationJSON = null;

      try {
        const verificationResp = await fetch(
          `${relayServerUrl}/verify-registration`,
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'api-key': relayApiKey,
            },
            body: JSON.stringify(attResp),
          }
        );

        verificationJSON = await verificationResp.json();
      } catch (e) {
        console.error(e);
        setError('Something went wrong with our server. Please try again.');
        return;
      }

      // If the credential was verified, continue to authentication step
      if (verificationJSON && verificationJSON.verified) {
        return await handleRegistered(attResp);
      } else {
        console.error('Error during WebAuthn registration', {
          err: JSON.stringify(verificationJSON),
        });
        setError('Failed to register your passkey. Please try again.');
        return;
      }
    } catch (error) {
      console.error(error);
      setError('Unable to register your passkey. Please try again.');
      return;
    }
  }

  async function handleRegistered(attResp) {
    const attestationObject = base64url.toBuffer(
      attResp.response.attestationObject
    );

    const { authData } = decodeAttestationObject(cbor, attestationObject);

    const parsedAuthData = parseAuthenticatorData(cbor, authData);

    setWebAuthnCredentialPublicKey(
      ethers.utils.hexlify(parsedAuthData.credentialPublicKey)
    );

    setView(LoginViews.AUTHENTICATE);
  }

  // Authenticate with WebAuthn credential and mint PKP
  async function authenticate() {
    setView(LoginViews.AUTHENTICATING);

    // Check if username is set
    if (!username) {
      const noUsernameErr = new Error('Passkey name is required');
      console.error(noUsernameErr);
      setError(noUsernameErr.message);
      return;
    }

    // Get authentication options from the relying party
    let publicKeyCredentialRequestOptions = null;

    try {
      const optionsRes = await fetch(
        `${relayServerUrl}/generate-authentication-options`,
        {
          method: 'GET',
          headers: {
            'api-key': relayApiKey,
          },
        }
      );
      if (optionsRes.status < 200 || optionsRes.status >= 400) {
        const relayErr = new Error(
          'Something went wrong with our server. Please try again.'
        );
        console.error('Relay server error: ', optionsRes);
        setError(relayErr.message);
        return;
      }

      publicKeyCredentialRequestOptions = await optionsRes.json();
    } catch (e) {
      console.error(e);
      setError('Something went wrong with our server. Please try again.');
      return;
    }

    try {
      // Pass the options to the authenticator and wait for a response
      const asseResp = await startAuthentication(
        publicKeyCredentialRequestOptions
      );
      // console.log('asseResp', asseResp);

      // Send the credential to the relying party for verification
      let verificationJSON = null;

      try {
        const verificationResp = await fetch(
          `${relayServerUrl}/verify-authentication`,
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'api-key': relayApiKey,
            },
            body: JSON.stringify(asseResp),
          }
        );

        verificationJSON = await verificationResp.json();
      } catch (e) {
        console.error(e);
        setError('Something went wrong with our server. Please try again.');
        return;
      }

      if (verificationJSON && verificationJSON.verified) {
        return await handleAuthenticated(asseResp);
      } else {
        console.error('Error during WebAuthn authentication', {
          err: JSON.stringify(verificationJSON),
        });
        setError('Failed to authenticate your passkey. Please try again.');
        return;
      }
    } catch (error) {
      console.error(error);
      setError('Unable to authenticate your passkey. Please try again.');
      return;
    }
  }

  async function handleAuthenticated(asseResp) {
    const clientDataHash = await crypto.subtle.digest(
      'SHA-256',
      base64url.toBuffer(asseResp.response.clientDataJSON)
    );

    const authDataBuffer = base64url.toBuffer(
      asseResp.response.authenticatorData
    );

    const signatureBase = Buffer.concat([
      authDataBuffer,
      Buffer.from(clientDataHash),
    ]);

    const signature = base64url.toBuffer(asseResp.response.signature);

    let currentPKP = null;

    try {
      currentPKP = await mintPKP(
        ethers.utils.hexlify(signature),
        ethers.utils.hexlify(signatureBase),
        webAuthnCredentialPublicKey
      );
    } catch (e) {
      console.error(e);
      setError(
        'Something went wrong with minting your wallet. Please try again.'
      );
      return;
    }

    if (currentPKP) {
      try {
        await createSession(
          currentPKP,
          ethers.utils.hexlify(signature),
          ethers.utils.hexlify(signatureBase),
          webAuthnCredentialPublicKey
        );
      } catch (e) {
        console.error(e);
        setError(
          'Something went wrong with creating your session. Please try again.'
        );
        return;
      }
    }
  }

  async function mintPKP(signature, signatureBase, credentialPublicKey) {
    setView(LoginViews.MINTING);

    const mintRes = await fetch(`${relayServerUrl}/auth/webauthn`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'api-key': relayApiKey,
      },
      body: JSON.stringify({
        signature,
        signatureBase,
        credentialPublicKey,
      }),
    });

    if (mintRes.status < 200 || mintRes.status >= 400) {
      const relayErr = new Error('Failed to mint PKP from relay server');
      console.error(relayErr);
      setError(relayErr.message);
      return;
    }

    const resBody = await mintRes.json();
    const requestId = resBody.requestId;

    const pollRes = await pollRequestUntilTerminalState(requestId);
    if (pollRes) {
      setView(LoginViews.MINTED);
      const newPKP = {
        tokenId: pollRes.pkpTokenId,
        publicKey: pollRes.pkpPublicKey,
        ethAddress: pollRes.pkpEthAddress,
      };
      return newPKP;
    }
  }

  // Poll the relay server for status of minting request
  async function pollRequestUntilTerminalState(requestId) {
    const maxPollCount = 20;
    for (let i = 0; i < maxPollCount; i++) {
      const response = await fetch(
        `${relayServerUrl}/auth/status/${requestId}`,
        {
          method: 'GET',
          headers: {
            'api-key': relayApiKey,
          },
        }
      );

      if (response.status < 200 || response.status >= 400) {
        const err = new Error(
          `Unable to poll the status of this mint PKP transaction: ${requestId}`
        );
        setError(err.message);
        return;
      }

      const resBody = await response.json();
      if (resBody.error) {
        // Exit loop since error
        const err = new Error(resBody.error);
        setError(err.message);
        return;
      } else if (resBody.status === 'Succeeded') {
        // Exit loop since success
        return resBody;
      }

      // otherwise, sleep then continue polling
      await new Promise(r => setTimeout(r, 1000));
    }

    // At this point, polling ended and still no success, set failure status
    // console.error(`Hmm this is taking longer than expected...`);
    const err = new Error('Polling for mint PKP transaction status timed out');
    setError(err.message);
    return;
  }

  async function createSession(
    currentPKP,
    signature,
    signatureBase,
    credentialPublicKey
  ) {
    setView(LoginViews.CREATING_SESSION);

    // Prepare params for generating session sigs
    const authMethodAccessToken = JSON.stringify({
      signature: signature,
      signatureBase: signatureBase,
      credentialPublicKey: credentialPublicKey,
    });
    // console.log('authMethodAccessToken', authMethodAccessToken);
    const pkpPublicKey = currentPKP.publicKey;
    const authMethod = {
      authMethodType: AuthMethodTypes.WEBAUTHN,
      accessToken: authMethodAccessToken,
    };
    const baseCallback = getDefaultAuthNeededCallback(
      [authMethod],
      pkpPublicKey
    );
    const expiration = new Date(
      Date.now() + 1000 * 60 * 60 * 24 * 14
    ).toISOString(); // 2 weeks
    const baseParams = {
      expiration: expiration,
      chain: 'ethereum',
      resources: ['litAction://*'],
      switchChain: false,
      authNeededCallback: baseCallback,
    };

    // Generate session sigs
    const litNodeClient = new LitNodeClient({
      litNetwork: 'serrano',
    });
    await litNodeClient.connect();
    const sessionSigs = await litNodeClient.getSessionSigs(baseParams);
    // console.log('sessionSigs', sessionSigs);

    setView(LoginViews.SESSION_CREATED);

    dispatch({
      type: 'authenticated',
      isAuthenticated: true,
      currentUsername: username,
      currentPKP: currentPKP,
      sessionSigs: sessionSigs,
      sessionExpiration: expiration,
    });
  }

  return (
    <>
      {view === LoginViews.ERROR && (
        <div>
          <svg
            xmlns="http://www.w3.org/2000/svg"
            fill="none"
            viewBox="0 0 24 24"
            strokeWidth={1.5}
            stroke="currentColor"
            className="w-10 h-10 text-red-500"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z"
            />
          </svg>
          <h1 className="mt-6 text-3xl sm:text-4xl text-base-100 font-medium mb-4">
            Uh oh!
          </h1>
          {errorMsg ? (
            <>
              <p className="mb-4">Something went wrong:</p>
              <p className="text-sm p-3 bg-red-900 bg-opacity-5 text-red-500 border border-red-500 border-opacity-40 mb-8">
                {errorMsg}
              </p>
            </>
          ) : (
            <p className="mb-8">Something went wrong.</p>
          )}
          {webAuthnCredentialPublicKey ? (
            <button
              className="w-full border border-base-500 px-6 py-3 text-base text-base-300 hover:bg-base-1000 focus:outline-none focus:ring-2 focus:ring-base-500 focus:ring-offset-2"
              onClick={() => setView(LoginViews.AUTHENTICATE)}
            >
              Try again
            </button>
          ) : (
            <button
              className="w-full border border-base-500 px-6 py-3 text-base text-base-300 hover:bg-base-1000 focus:outline-none focus:ring-2 focus:ring-base-500 focus:ring-offset-2"
              onClick={() => setView(LoginViews.SIGN_UP)}
            >
              Go back
            </button>
          )}
        </div>
      )}
      {view === LoginViews.SIGN_UP && (
        <div>
          <h1 className="text-3xl sm:text-4xl text-base-100 font-medium mb-4">
            The most secure and customizable wallet that&apos;s 100% yours.
          </h1>
          <p className="text-sm sm:text-base mb-6">
            Create a self-custody wallet in just a few taps using the latest
            auth flow&mdash;passkeys. No more passwords, no more seed phrases,
            no more extensions.
          </p>
          <form onSubmit={register} className="w-100 mb-3">
            <div className="mb-6">
              <label
                htmlFor="username"
                className="block text-base text-base-300"
              >
                Your passkey name
              </label>
              <div className="mt-1">
                <input
                  name="username"
                  type="text"
                  autoComplete="username webauthn"
                  aria-describedby="username-field"
                  placeholder='e.g. "Eth Denver 2023"'
                  value={username}
                  onChange={e => setUsername(e.target.value)}
                  className="block w-full border border-transparent bg-base-1000 focus:border-indigo-500 focus:ring-indigo-500"
                />
              </div>
              <p id="username-field" className="mt-2 text-sm text-base-500">
                Give your passkey a unique name.
              </p>
            </div>
            <button
              type="submit"
              className="w-full border border-indigo-500 px-6 py-3 text-base text-indigo-300 bg-indigo-600 bg-opacity-20 hover:bg-opacity-10 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2"
            >
              Get started
            </button>
          </form>
          {/* <div className="text-sm text-base-500 text-center">
            Have a wallet?{' '}
            <button
              className="text-indigo-400 hover:text-indigo-500 focus:outline-none hover:underline"
              onClick={() => setView(LoginViews.SIGN_IN)}
            >
              Sign in
            </button>
          </div> */}
        </div>
      )}
      {view === LoginViews.REGISTERING && (
        <div>
          <svg
            xmlns="http://www.w3.org/2000/svg"
            fill="none"
            viewBox="0 0 24 24"
            strokeWidth={1.5}
            stroke="currentColor"
            className="animate-pulse w-10 h-10 text-base-300"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M15.75 5.25a3 3 0 013 3m3 0a6 6 0 01-7.029 5.912c-.563-.097-1.159.026-1.563.43L10.5 17.25H8.25v2.25H6v2.25H2.25v-2.818c0-.597.237-1.17.659-1.591l6.499-6.499c.404-.404.527-1 .43-1.563A6 6 0 1121.75 8.25z"
            />
          </svg>
          <h1 className="mt-6 text-3xl sm:text-4xl text-base-100 font-medium mb-4">
            Register your passkey
          </h1>
          <p className="text-sm sm:text-base mb-6">
            Follow your browser&apos;s prompts to create a passkey.
          </p>
        </div>
      )}
      {view === LoginViews.AUTHENTICATE && (
        <div>
          <svg
            xmlns="http://www.w3.org/2000/svg"
            fill="none"
            viewBox="0 0 24 24"
            strokeWidth={1.5}
            stroke="currentColor"
            className="w-10 h-10 text-base-300"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M15.362 5.214A8.252 8.252 0 0112 21 8.25 8.25 0 016.038 7.048 8.287 8.287 0 009 9.6a8.983 8.983 0 013.361-6.867 8.21 8.21 0 003 2.48z"
            />
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M12 18a3.75 3.75 0 00.495-7.467 5.99 5.99 0 00-1.925 3.546 5.974 5.974 0 01-2.133-1A3.75 3.75 0 0012 18z"
            />
          </svg>
          <h1 className="mt-6 text-3xl sm:text-4xl text-base-100 font-medium mb-4">
            Use your new passkey
          </h1>
          <p className="mb-4">
            You have created a new passkey&mdash;
            <span className="text-base-200 font-medium">{username}</span>.
          </p>
          <p className="mb-8">
            Authenticate with your new passkey to mint a cloud wallet that only
            you can access and control with your passkey.
          </p>
          <button
            className="w-full border border-indigo-500 px-6 py-3 text-base text-base-300 hover:bg-base-1000 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2"
            onClick={authenticate}
          >
            Authenticate
          </button>
        </div>
      )}
      {view === LoginViews.AUTHENTICATING && (
        <div>
          <svg
            xmlns="http://www.w3.org/2000/svg"
            fill="none"
            viewBox="0 0 24 24"
            strokeWidth={1.5}
            stroke="currentColor"
            className="w-10 h-10 text-base-300"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M15.75 5.25a3 3 0 013 3m3 0a6 6 0 01-7.029 5.912c-.563-.097-1.159.026-1.563.43L10.5 17.25H8.25v2.25H6v2.25H2.25v-2.818c0-.597.237-1.17.659-1.591l6.499-6.499c.404-.404.527-1 .43-1.563A6 6 0 1121.75 8.25z"
            />
          </svg>
          <h1 className="mt-6 text-3xl sm:text-4xl text-base-100 font-medium mb-4">
            Authenticate your passkey
          </h1>
          <p className="text-sm sm:text-base mb-6">
            Follow your browser&apos;s prompts to verify your identity.
          </p>
        </div>
      )}
      {view === LoginViews.MINTING && (
        <div>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/loading.gif"
            className="w-20 object-contain"
            alt="Nyan Cat loading gif"
          ></img>

          <h1 className="mt-6 text-3xl sm:text-4xl text-base-100 font-medium mb-4">
            Minting wallet...
          </h1>
          <p className="text-sm sm:text-base mb-6">
            Hang tight and keep this page open as your cloud wallet is being
            minted.
          </p>
        </div>
      )}
      {view === LoginViews.MINTED && (
        <div>
          <svg
            xmlns="http://www.w3.org/2000/svg"
            fill="none"
            viewBox="0 0 24 24"
            strokeWidth={1.5}
            stroke="currentColor"
            className="w-10 h-10 text-base-300"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09zM18.259 8.715L18 9.75l-.259-1.035a3.375 3.375 0 00-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 002.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 002.456 2.456L21.75 6l-1.035.259a3.375 3.375 0 00-2.456 2.456zM16.894 20.567L16.5 21.75l-.394-1.183a2.25 2.25 0 00-1.423-1.423L13.5 18.75l1.183-.394a2.25 2.25 0 001.423-1.423l.394-1.183.394 1.183a2.25 2.25 0 001.423 1.423l1.183.394-1.183.394a2.25 2.25 0 00-1.423 1.423z"
            />
          </svg>
          <h1 className="mt-6 text-3xl sm:text-4xl text-base-100 font-medium mb-4">
            Your wallet is ready!
          </h1>
          <p className="text-sm sm:text-base mb-6">
            Loading your new cloud wallet...
          </p>
        </div>
      )}
      {view === LoginViews.CREATING_SESSION && (
        <div>
          <svg
            xmlns="http://www.w3.org/2000/svg"
            fill="none"
            viewBox="0 0 24 24"
            strokeWidth={1.5}
            stroke="currentColor"
            className="animate-pulse w-10 h-10 text-base-300"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M15.75 9V5.25A2.25 2.25 0 0013.5 3h-6a2.25 2.25 0 00-2.25 2.25v13.5A2.25 2.25 0 007.5 21h6a2.25 2.25 0 002.25-2.25V15m3 0l3-3m0 0l-3-3m3 3H9"
            />
          </svg>
          <h1 className="mt-6 text-3xl sm:text-4xl text-base-100 font-medium mb-4">
            Signing in...
          </h1>
          <p className="text-sm sm:text-base mb-6">
            Gathering your key shares to save your new session.
          </p>
        </div>
      )}
      {view === LoginViews.SESSION_CREATED && (
        <div>
          <svg
            xmlns="http://www.w3.org/2000/svg"
            fill="none"
            viewBox="0 0 24 24"
            strokeWidth={1.5}
            stroke="currentColor"
            className="w-10 h-10 text-base-300"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M12 21a9.004 9.004 0 008.716-6.747M12 21a9.004 9.004 0 01-8.716-6.747M12 21c2.485 0 4.5-4.03 4.5-9S14.485 3 12 3m0 18c-2.485 0-4.5-4.03-4.5-9S9.515 3 12 3m0 0a8.997 8.997 0 017.843 4.582M12 3a8.997 8.997 0 00-7.843 4.582m15.686 0A11.953 11.953 0 0112 10.5c-2.998 0-5.74-1.1-7.843-2.918m15.686 0A8.959 8.959 0 0121 12c0 .778-.099 1.533-.284 2.253m0 0A17.919 17.919 0 0112 16.5c-3.162 0-6.133-.815-8.716-2.247m0 0A9.015 9.015 0 013 12c0-1.605.42-3.113 1.157-4.418"
            />
          </svg>
          <h1 className="mt-6 text-3xl sm:text-4xl text-base-100 font-medium mb-4">
            Success!
          </h1>
          <p className="text-sm sm:text-base mb-6">
            You should now be signed in. Refresh this page if you don&apos;t see
            your dashboard.
          </p>
        </div>
      )}
      {view === LoginViews.SIGN_IN && (
        <div>
          <h1 className="text-3xl sm:text-4xl text-base-100 font-medium mb-4">
            Welcome back
          </h1>
          <p className="text-sm sm:text-base mb-6">
            Navigate the open web with a secure, self-custody wallet that you
            can easily tailor to your needs.
          </p>
          <form onSubmit={authenticate} className="w-100 mb-3">
            <div className="mb-6">
              <label
                htmlFor="username"
                className="block text-base text-base-300"
              >
                Your passkey name
              </label>
              <div className="mt-1">
                <input
                  name="username"
                  type="text"
                  autoComplete="username webauthn"
                  aria-describedby="username-field"
                  value={username}
                  onChange={e => setUsername(e.target.value)}
                  className="block w-full border border-transparent bg-base-1000 focus:border-indigo-500 focus:ring-indigo-500"
                />
              </div>
              <p id="username-field" className="mt-2 text-sm text-base-500">
                Use the passkey linked to your cloud wallet.
              </p>
            </div>
            <button
              type="submit"
              className="w-full border border-indigo-500 px-6 py-3 text-base text-indigo-300 bg-indigo-600 bg-opacity-20 hover:bg-opacity-10 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2"
            >
              Sign in
            </button>
          </form>
          <div className="text-sm text-base-500 text-center">
            Need a cloud wallet?{' '}
            <button
              onClick={() => setView(LoginViews.SIGN_UP)}
              className="text-indigo-400 hover:text-indigo-500 focus:outline-none hover:underline"
            >
              Create one
            </button>
          </div>
        </div>
      )}
      <Footer
        showDisclaimer={
          view === LoginViews.SIGN_UP || view === LoginViews.SIGN_IN
        }
      />
    </>
  );
}