import { PROTOCOLS } from '../../shared/protocol';

export function Landing() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100">
      <div className="max-w-4xl mx-auto px-6 py-16">
        {/* Hero */}
        <div className="text-center mb-16">
          <h1 className="text-4xl font-bold text-gray-900 mb-4">
            RPC <span className="text-indigo-600">over Ably</span>
          </h1>
          <p className="text-lg text-gray-600 max-w-2xl mx-auto">
            Ably works as a transport for <em>any</em> RPC protocol. Pick one
            below to see bidirectional RPC between browser tabs, powered by{' '}
            <a
              href="https://ably.com"
              className="text-indigo-600 hover:text-indigo-700 underline"
              target="_blank"
              rel="noopener noreferrer"
            >
              Ably's realtime infrastructure
            </a>
            .
          </p>
        </div>

        {/* Protocol cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-16">
          <a
            href="?protocol=capnweb"
            className="group block bg-white rounded-xl shadow-sm border border-gray-200 p-8 hover:shadow-md hover:border-indigo-300 transition-all"
          >
            <div className="flex items-center gap-3 mb-3">
              <span className="text-3xl">&#x26A1;</span>
              <h2 className="text-xl font-semibold text-gray-900 group-hover:text-indigo-600 transition-colors">
                {PROTOCOLS.capnweb.label}
              </h2>
            </div>
            <p className="text-gray-600 text-sm leading-relaxed mb-4">
              {PROTOCOLS.capnweb.description}
            </p>
            <div className="flex flex-wrap gap-2">
              <span className="px-2 py-0.5 bg-indigo-50 text-indigo-600 text-xs rounded-full">
                Promise pipelining
              </span>
              <span className="px-2 py-0.5 bg-indigo-50 text-indigo-600 text-xs rounded-full">
                Pass-by-reference
              </span>
              <span className="px-2 py-0.5 bg-indigo-50 text-indigo-600 text-xs rounded-full">
                Zero boilerplate
              </span>
            </div>
          </a>

          <a
            href="?protocol=jsonrpc"
            className="group block bg-white rounded-xl shadow-sm border border-gray-200 p-8 hover:shadow-md hover:border-indigo-300 transition-all"
          >
            <div className="flex items-center gap-3 mb-3">
              <span className="text-3xl">&#x1F310;</span>
              <h2 className="text-xl font-semibold text-gray-900 group-hover:text-indigo-600 transition-colors">
                {PROTOCOLS.jsonrpc.label}
              </h2>
            </div>
            <p className="text-gray-600 text-sm leading-relaxed mb-4">
              {PROTOCOLS.jsonrpc.description}
            </p>
            <div className="flex flex-wrap gap-2">
              <span className="px-2 py-0.5 bg-blue-50 text-blue-600 text-xs rounded-full">
                RFC standard
              </span>
              <span className="px-2 py-0.5 bg-blue-50 text-blue-600 text-xs rounded-full">
                Every language
              </span>
              <span className="px-2 py-0.5 bg-blue-50 text-blue-600 text-xs rounded-full">
                Plain JSON
              </span>
            </div>
          </a>
        </div>

        {/* Comparison table */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-200">
            <h3 className="text-sm font-semibold text-gray-700 uppercase tracking-wide">
              Protocol comparison
            </h3>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50">
                  <th className="text-left px-6 py-3 text-gray-600 font-medium">
                    Feature
                  </th>
                  <th className="text-left px-6 py-3 text-gray-600 font-medium">
                    capnweb
                  </th>
                  <th className="text-left px-6 py-3 text-gray-600 font-medium">
                    JSON-RPC 2.0
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                <tr>
                  <td className="px-6 py-3 text-gray-700">Bidirectional</td>
                  <td className="px-6 py-3 text-gray-600">
                    Built-in (capability model)
                  </td>
                  <td className="px-6 py-3 text-gray-600">
                    Via ServerAndClient
                  </td>
                </tr>
                <tr>
                  <td className="px-6 py-3 text-gray-700">
                    Promise pipelining
                  </td>
                  <td className="px-6 py-3 text-green-600">Yes</td>
                  <td className="px-6 py-3 text-gray-400">No</td>
                </tr>
                <tr>
                  <td className="px-6 py-3 text-gray-700">
                    Pass-by-reference
                  </td>
                  <td className="px-6 py-3 text-green-600">Yes (RpcTarget)</td>
                  <td className="px-6 py-3 text-gray-400">No</td>
                </tr>
                <tr>
                  <td className="px-6 py-3 text-gray-700">Wire format</td>
                  <td className="px-6 py-3 text-gray-600">
                    JSON (internal framing)
                  </td>
                  <td className="px-6 py-3 text-gray-600">Plain JSON</td>
                </tr>
                <tr>
                  <td className="px-6 py-3 text-gray-700">Cross-language</td>
                  <td className="px-6 py-3 text-gray-400">JavaScript only</td>
                  <td className="px-6 py-3 text-green-600">
                    Every major language
                  </td>
                </tr>
                <tr>
                  <td className="px-6 py-3 text-gray-700">Standardized</td>
                  <td className="px-6 py-3 text-gray-400">No</td>
                  <td className="px-6 py-3 text-green-600">Yes (RFC)</td>
                </tr>
                <tr>
                  <td className="px-6 py-3 text-gray-700">Boilerplate</td>
                  <td className="px-6 py-3 text-green-600">
                    Zero (export object)
                  </td>
                  <td className="px-6 py-3 text-gray-600">
                    Register by method name
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
