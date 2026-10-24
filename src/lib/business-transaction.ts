import { createLocalReq, type Payload, type PayloadRequest, type TypedUser } from "payload";
/** One request keeps collection hooks, task sync and audit records in the same transaction. */
export async function businessTransaction<T>(payload: Payload, user: TypedUser, work: (req: PayloadRequest) => Promise<T>): Promise<T> {
  const req = await createLocalReq({ user }, payload);
  const transactionID = await payload.db.beginTransaction({ isolationLevel: "serializable" });
  if (!transactionID) throw new Error("无法启动事务，请稍后重试");
  req.transactionID = transactionID;
  try {
    const result = await work(req);
    await payload.db.commitTransaction(transactionID);
    return result;
  } catch (error) {
    await payload.db.rollbackTransaction(transactionID);
    throw error;
  }
}
