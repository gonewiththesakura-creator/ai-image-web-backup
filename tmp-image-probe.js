const models=['gpt-image-1','gpt-image-1.5'];
(async()=>{
for (const model of models) {
  const t0=Date.now();
  try {
    const r=await fetch('http://sub2api:8080/v1/images/generations', {
      method:'POST',
      headers:{Authorization:`Bearer ${process.env.TRIAL_API_KEY}`,'Content-Type':'application/json'},
      body:JSON.stringify({model,prompt:'一只橘猫，简单写实摄影',size:'1024x1024',quality:'low',output_format:'webp',n:1})
    });
    const text=await r.text();
    let parsed; try{ parsed=JSON.parse(text) } catch {}
    console.log(JSON.stringify({model,status:r.status,ms:Date.now()-t0,hasImage:Array.isArray(parsed?.data)&&parsed.data.some(x=>x.url||x.b64_json),error:parsed?.error?.message||parsed?.message||text.slice(0,200)}));
  } catch (e) {
    console.log(JSON.stringify({model,error:e.message,ms:Date.now()-t0}));
  }
}
})();
