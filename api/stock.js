module.exports = async function handler(req,res){
  res.setHeader('Cache-Control','no-store');
  const upstream=process.env.APPS_SCRIPT_URL;
  const token=process.env.STOCK_API_TOKEN;
  if(!upstream||!token){return res.status(503).json({ok:false,error:'App backend is not configured yet.'});}
  try{
    let response;
    if(req.method==='GET'){
      const url=new URL(upstream);
      Object.entries(req.query||{}).forEach(([k,v])=>url.searchParams.set(k,String(v)));
      url.searchParams.set('token',token);
      response=await fetch(url.toString(),{redirect:'follow'});
    }else if(req.method==='POST'){
      const body=typeof req.body==='string'?JSON.parse(req.body||'{}'):(req.body||{});
      response=await fetch(upstream,{method:'POST',redirect:'follow',headers:{'Content-Type':'text/plain;charset=utf-8'},body:JSON.stringify({...body,token})});
    }else{
      res.setHeader('Allow','GET, POST');
      return res.status(405).json({ok:false,error:'Method not allowed'});
    }
    const text=await response.text();
    let data;try{data=JSON.parse(text);}catch{throw new Error('Apps Script returned an invalid response');}
    return res.status(response.ok?200:502).json(data);
  }catch(err){
    console.error('stock proxy error',err);
    return res.status(502).json({ok:false,error:'Could not reach the stock backend.'});
  }
};