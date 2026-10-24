import {headers} from "next/headers";
import {redirect} from "next/navigation";
import {getPayload} from "payload";
import config from "@payload-config";
import AppShell from "../../components/app-shell";
import TrashClient from "./trash-client";
export const dynamic="force-dynamic";
export default async function TrashPage(){
 const payload=await getPayload({config});const {user}=await payload.auth({headers:await headers()});if(!user)redirect("/admin/login?redirect=/content-management/trash");
 const assets=await payload.find({collection:"content-assets",where:{deletedAt:{exists:true}},select:{title:true,deletedAt:true},sort:"-deletedAt",pagination:false,depth:0,overrideAccess:true,user});
 return <AppShell userName={user.displayName} breadcrumbs={["内容资产管理","回收站"]}><TrashClient assets={assets.docs} /></AppShell>;
}
