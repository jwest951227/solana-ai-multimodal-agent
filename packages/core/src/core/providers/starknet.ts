import { Account, type Call, CallData, RpcProvider } from "starknet";
import { env } from "../env";

/**
 * Returns a configured Starknet provider based on environment variables.
 */
export const getStarknetProvider = () => {
  return new RpcProvider({
    nodeUrl: env.STARKNET_RPC_URL,
  });
};

/**
 * Returns an `Account` object for executing transactions on Starknet.
 */
export const getStarknetAccount = () => {
  return new Account(
    getStarknetProvider(),
    env.STARKNET_ADDRESS,
    env.STARKNET_PRIVATE_KEY
  );
};

/**
 * Executes a read (callContract) on Starknet.
 */
export const executeStarknetRead = async (call: Call): Promise<any> => {
  try {
    call.calldata = CallData.compile(call.calldata || []);
    return await getStarknetProvider().callContract(call);
  } catch (error) {
    return error instanceof Error ? error : new Error("Unknown error occurred");
  }
};

/**
 * Executes a transaction on Starknet and waits for it to be accepted.
 */
export const executeStarknetTransaction = async (call: Call): Promise<any> => {
  try {
    call.calldata = CallData.compile(call.calldata || []);

    const account = getStarknetAccount();
    const { transaction_hash } = await account.execute(call);

    return await account.waitForTransaction(transaction_hash, {
      retryInterval: 1000,
    });
  } catch (error) {
    return error instanceof Error ? error : new Error("Unknown error occurred");
  }
};
