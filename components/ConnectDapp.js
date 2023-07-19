import { useState, useCallback } from 'react';
import CallRequest from './CallRequest';
import { useAppState } from '../context/AppContext';

export default function ConnectDapp({ goBack }) {
  const [address, setAddress] = useState('');
  const { currentPKP } = useAppState();

  const submitTransaction = useCallback(async event => {
    event.preventDefault();

    const dapp = CallRequest({
      method: 'eth_sendRawTransaction',
      params: [
        {
          from: currentPKP.address,
          to: address,
          value: '24',
          gas: '0x5208',
          gasPrice: '0x4a817c800',
          data: '0x',
        },
      ],
    });
  });

  return (
    <>
      <button onClick={goBack} className="p-1 mb-6 hover:text-base-200">
        <svg
          xmlns="http://www.w3.org/2000/svg"
          fill="none"
          viewBox="0 0 24 24"
          strokeWidth={1.5}
          stroke="currentColor"
          className="w-6 h-6"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M10.5 19.5L3 12m0 0l7.5-7.5M3 12h18"
          />
        </svg>
      </button>
      <div>
        <>
          <h1 className="text-2xl text-base-100 font-medium mb-2">
            Send $MNT to
          </h1>
          <div>
            <form
              className="flex flex-wrap w-full sm:flex-nowrap"
              onSubmit={submitTransaction}
            >
              <input
                type="text"
                id="wallet-name"
                value={address}
                onChange={e => setAddress(e.target.value)}
                placeholder="0x..."
                className="mb-2 sm:mb-0 sm:mr-2 px-2 grow w-full text-sm border border-transparent bg-base-1000 focus:border-indigo-500 focus:ring-indigo-500"
              ></input>
              <button
                type="submit"
                disabled={address === ''}
                className="grow sm:grow-0 border border-base-500 px-4 py-2 text-sm text-base-300 hover:bg-base-1000 focus:outline-none focus:ring-2 focus:ring-base-500 focus:ring-offset-2 disabled:hover:bg-root-dark disabled:opacity-75 disabled:cursor-not-allowed"
              >
                Send
              </button>
            </form>
          </div>
        </>
      </div>
    </>
  );
}
