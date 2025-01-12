import type { ActionHandler } from "../../types";
import { fetchData } from "../providers";

export const graphqlAction: ActionHandler = async (action, chain) => {
  const { query, variables } = action.payload || {};
  const result = await fetchData(query, variables);
  const resultStr =
    `query: ` + query + `\n\nresult: ` + JSON.stringify(result, null, 2);
  return resultStr;
};
