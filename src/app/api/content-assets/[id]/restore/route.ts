import { headers } from "next/headers";
import { NextResponse } from "next/server";
import { getPayload } from "payload";
import config from "@payload-config";
import { businessTransaction } from "@/lib/business-transaction";
export async function POST(_request:Request,{params}:{params:Promise<{id:string}>}) {
 const payload=await getPayload({config});const {user}=await payload.auth({headers:await headers()});
 if(!user)return NextResponse.json({message:"未登录"},{status:401});
 const {id}=await params;
 try { const doc=await businessTransaction(payload,user,async req=> {
  const asset=await payload.findByID({collection:"content-assets",id,depth:0,overrideAccess:true,req});
  if(!asset.deletedAt)return asset;
  return payload.update({collection:"content-assets",id,data:{deletedAt:null},overrideAccess:true,req,context:{businessAction:"restore"}});
 }); return NextResponse.json({doc}); }
 catch(error){return NextResponse.json({message:error instanceof Error ? error.message : "恢复失败，请重试"},{status:409});}
}
