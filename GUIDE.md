# Connecting Lit PKPs with dApps

To enable secure communication between a PKP and a dApp, all you need to do is:

1. Create a Lit PKP Wallet object
2. Establish a WalletConnect connection
3. Subscribe and respond to events

Note: This guide requires a PKP. To mint a PKP NFT, visit the [Lit Explorer](https://explorer.litprotocol.com/mint-pkp). You'll need some [test Matic](https://faucet.polygon.technology/) on your wallet.

</br>

## Creating a Lit PKP object

`LitPKP` is a wrapper of [PKPWallet](https://github.com/LIT-Protocol/pkp-ethers.js/tree/main/packages/wallet), a Wallet class that extends `ether.js Signer` and provides convenient methods to sign transactions and messages using [Lit Actions](https://developer.litprotocol.com/SDK/Explanation/litActions).

`LitPKP` includes added functionality to handle Ethereum JSON RPC signing requests, which will be used to respond to requests facilitated through WalletConnect.

To create a new `LitPKP` object, you'll need:

- your PKP's public key
- an `authSig` that can be obtained from the client side by invoking [checkAndSignAuthMessage](https://developer.litprotocol.com/sdk/explanation/walletsigs/authsig/#obtaining-the-authsig)
- the RPC URL of the network that your PKP should be using

```jsx
import LitJsSdk from 'lit-js-sdk';
import { LitPKP } from 'lit-pkp-sdk';

const publicKey =
  '0x0439e24fbe3332dd2abe3073f663a58fc74674095e5834ebbe7a86fd52f1cbe54b8268d6426fbd66a6979d787b6848b750f3a64a6354da4616f93a3031f3d44e95';

const authSig = await LitJsSdk.checkAndSignAuthMessage({
  chain: 'mumbai',
});

const rpcUrl = 'https://rpc-mumbai.maticvigil.com/';

const wallet = new LitPKP({
  pkpPubKey: publicKey,
  controllerAuthSig: authSig,
  provider: rpcUrl,
});

await wallet.init();
```

</br>

## Initializing a WalletConnect connector

To create a WalletConnect connector that will interact with a dApp, you'll need a `uri` from a dApp. You can get a `uri` by visiting to this [example dApp](https://example.walletconnect.org/), tapping 'Connect to WalletConnect' button, and copying the QR code to your clipboard.

```jsx
import WalletConnect from '@walletconnect/client';

// Create connector
const connector = new WalletConnect({
  // Replace this value with the dApp's URI you copied
  uri: 'wc:8a5e5bdc-a0e4-47...TJRNmhWJmoxdFo6UDk2WlhaOyQ5N0U=',
  // Replace the following details with your own app's info
  clientMeta: {
    description: 'WalletConnect Developer App',
    url: 'https://walletconnect.org',
    icons: ['https://walletconnect.org/walletconnect-logo.png'],
    name: 'WalletConnect',
  },
});
```

You can also create a WalletConnect connector with an existing `session` object, which is automatically stored in the browser's local storage as `walletconnect`. You can specify the local storage key by using the `storageId` parameter when creating a new connector.

</br>

## Subscribing to events

Subscribe the connector to events to get notified when a dApp requests to connect to your PKP (`session_request`), when a dApp wants your PKP to sign messages or send transactions (`call_request`), and when a dApp disconnects from your PKP (`disconnect`).

When the subscribed event fires, the connector will respond by calling the callback function you passed to the event listener.

```jsx
// Subscribe to session requests
connector.on('session_request', (error, payload) => {
  if (error) {
    throw error;
  }

  // Handle session request here
});

// Subscribe to call requests
connector.on('call_request', (error, payload) => {
  if (error) {
    throw error;
  }

  // Handle call request here
});

connector.on('disconnect', (error, payload) => {
  if (error) {
    throw error;
  }

  // Handle disconnect here
});
```

You can find more events to listen to in the [docs](https://docs.walletconnect.com/1.0/client-api#register-event-subscription).

</br>

## Handling session requests

A `session_request` event will fire when a dApp requests to connect to your PKP.

Example `session_request` payload from the dApp:

```
{
  id: 1,
  jsonrpc: '2.0'.
  method: 'session_request',
  params: [{
    peerId: '15d8b6a3-15bd-493e-9358-111e3a4e6ee4',
    peerMeta: {
      name: "WalletConnect Example",
      description: "Try out WalletConnect v1.0",
      icons: ["https://example.walletconnect.org/favicon.ico"],
      url: "https://example.walletconnect.org"
    }
  }]
}
```

You can approve or reject the session request by calling `approveSession` or `rejectSession` on the connector.

When approving a session, you will need to pass in a `chainId` and `accounts` array. The `chainId` should be the chain ID of the network your PKP is connected to. The `accounts` array should include just the ETH address of your PKP.

```jsx
// Approve session
connector.approveSession({
  accounts: [address],
  chainId: chainId,
});

// Reject Session
connector.rejectSession({
  message: 'OPTIONAL_ERROR_MESSAGE', // Optional
});
```

</br>

## Handling call requests

Once the session is approved, the dApp can send requests to your PKP to sign messages, send transactions, and more, triggering the `call_request` event.

Example `call_request` payload from the dApp:

```
{
  id: 1,
  jsonrpc: '2.0'.
  method: 'eth_sign',
  params: [
    "0xbc28ea04101f03ea7a94c1379bc3ab32e65e62d3",
    "My email is john@doe.com - 1537836206101"
  ]
}
```

Handle the call request by invoking `approveRequest` or `rejectRequest` on the connector.

When approving a call request, you will need to provide the `result` from handling the request. You can use the `LitPKP` Wallet object to generate the results you need for requests that require interacting with your PKP. Those signing requests include:

- eth_sign
- personal_sign
- signTypedData
- signTypedData_v1
- signTypedData_v3
- signTypedData_v4
- signTransaction
- sendTransaction

```jsx
// Sign with PKP Wallet
const result = await wallet.signEthereumRequest(payload);

// Approve request
connector.approveRequest({
  id: payload.id,
  result: result,
});

// Reject request
connector.rejectRequest({
  id: payload.id,
  error: {
    message: 'OPTIONAL_ERROR_MESSAGE', // Optional
  },
});
```

The expected payloads and results for Ethereum JSON RPC signing requests are specified [here](https://docs.walletconnect.com/1.0/json-rpc-api-methods/ethereum).

</br>

## Disconnect from a dApp

To disconnect from a dApp, call `killSession` on the connector.

```jsx
connector.killSession();
```

</br>

---

</br>

# Things to note

</br>

## Using Webpack 5

If you're using Webpack 5, you may run into an error like this:

```
BREAKING CHANGE: webpack < 5 used to include polyfills for node.js core modules by default. This is no longer the case. Verify if you need this module and configure a polyfill for it.
```

Follow this [guide](https://alchemy.com/blog/how-to-polyfill-node-core-modules-in-webpack-5) to resolve the issue.

</br>

## Session request not firing

Very occasionally, the `session_request` event may not fire when a dApp requests to connect to your PKP. This may be due to a stale URI or a clogged bridge server. You can try to refresh the dApp for a new URI or restart your development server to get assigned a different bridge server.

Using HTTPs for local development has also reduced the frequency of this issue. Check out this guide on [using HTTPs locally](https://web.dev/how-to-use-local-https/) or easy-to-use tools like [ngrok](https://ngrok.com/).

</br>

## Managing state and user interactions

This guide touches upon integrating Lit and WalletConnect SDKs. In a full-fledged web app, you'll need to keep track of the user's PKPs, existing WalletConnect connectors, and pending and completed WalletConnect requests. You'll also need to handle user interactions, such as approving or rejecting a call request from a dApp.

This repo uses React Context and `useReducer` hook to manage state as seen here [here](https://github.com/LIT-Protocol/pkp-walletconnect/blob/main/context/AppContext.js). Rainbow Wallet also provides a [good example](https://github.com/rainbow-me/rainbow/blob/develop/src/redux/walletconnect.ts) of state management using Redux.

</br>

## WalletConnect V1 vs V2

This repo uses WalletConnect V1, which will be deprecated in March 1, 2023. You can find more information about the deprecation [here](https://medium.com/walletconnect/walletconnect-v1-0-sunset-notice-and-migration-schedule-8af9d3720d2e).

At the time of developing the Lit PKP x WalletConnect example, many production and test dApps are still using WalletConnect V1. Since WalletConnect V2 is not backwards-compatible with V1, you may need to support both versions in your app.

The [WalletConnect migration guide](https://docs.walletconnect.com/2.0/advanced/migrating-from-v1.0) notes major changes. One notable change is that a single WalletConnect client can manage multiple sessions. This means you no longer need to create a new connector for each dApp as seen in the examples using WalletConnect V1.

</br>

---

</br>

# Time to build

Now that you've learned how to integrate Lit Protocol and WalletConnect, it's time to build your own apps that leverage Lit Protocol's powerful decentralized key management network. Find inspiration [here](https://github.com/LIT-Protocol/awesome/blob/main/README.md) and learn more about our grants [here](https://developer.litprotocol.com/ecosystem/litgrants/).

If you run into any issues, feel free to reach out to us on [Discord](https://litgateway.com/discord).