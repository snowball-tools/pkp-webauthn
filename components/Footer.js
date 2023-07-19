export default function Footer({ showDisclaimer = false }) {
  return (
    <div className="mt-4">
      {showDisclaimer && (
        <p className="mb-4 sm:mb-6 text-xs sm:text-sm p-3 bg-yellow-900 bg-opacity-5 text-yellow-500 border border-yellow-500 border-opacity-40">
          ⚠️ This is for demo purposes only. Do{' '}
          <span className="font-medium text-yellow-500">not</span> store
          anything of value on your test cloud wallets at this time.
        </p>
      )}
    </div>
  );
}
