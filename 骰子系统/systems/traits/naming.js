/* 属性关键词命名器：只读取武魂ID、主属性、关键词；不读取任何子目录。 */
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.WitnessTraitNames=api;})(typeof globalThis==='undefined'?this:globalThis,function(){
'use strict';
const WORDS={
 金:['玄铁 金辉 银锋 铜纹 铸骨 锐芒 鎏光 钢脉','鸣锋 照刃 锻心 裂石 开隙 逐影 归鞘 铸星'],
 木:['青枝 古根 翠叶 灵藤 芽心 碧林 木脉 年轮','舒叶 向荣 繁生 连枝 寻隙 含春 展萼 扶风'],
 水:['清泉 碧澜 沧流 潮痕 泽心 深潭 涓波 玄渊','洗尘 润物 逐浪 溯源 分流 穿隙 映月 回潮'],
 火:['赤焰 星火 炎心 烬光 熔流 丹炉 燎原 朱炬','照夜 淬锋 燃薪 腾光 拂晓 融金 起燎 续焰'],
 土:['坤脉 岩心 山骨 砂纹 磐石 厚壤 峰影 尘丘','承势 塑锋 镇岳 起峦 聚砂 筑形 磨砺 藏峰'],
 风:['岚影 青空 流岚 长风 轻羽 云隙 旋流 天息','绕锋 逐叶 掠野 翔空 归旋 拂尘 穿林 行云'],
 雷:['霆光 电纹 雷脉 霄鸣 紫霆 天鼓 闪芒 迅弧','惊蛰 贯流 瞬发 传锋 破空 鸣霄 引势 震野'],
 冰:['霜纹 雪魄 冰棱 寒玉 凝晶 冻泉 银岭 冷辉','封枝 凝锋 含光 折雪 刻痕 明镜 藏寒 映霜'],
 光:['曜纹 晨辉 明棱 照影 晶芒 金晖 曦轮 皓光','凝刃 转曜 照尘 聚束 明形 熠彩 穿云 映昼'],
 暗:['夜幕 墨影 幽纹 暝光 隐痕 黯星 深帷 玄夜','匿锋 蔓染 藏迹 沉晖 掩月 渗隙 潜行 织幕'],
 毒:['翠痕 蚀纹 隐毒 幽蕊 蛇信 碧雾 蝎芒 蜂针','入脉 染锋 变质 浸心 化蜕 缠息 渗骨 藏针'],
 精神:['念海 灵台 心弦 识纹 梦痕 慧光 意脉 心镜','听心 凝念 观微 明觉 牵思 定识 映意 探幽'],
 音波:['弦光 律纹 清笛 玉磬 琴心 鸣钟 声潮 鼓韵','和鸣 调弦 叩玉 长吟 合拍 振羽 余音 清歌'],
 幽灵:['幽灯 魂影 虚幕 灵痕 夜魄 幽纱 空相 冥纹','寄形 隐躯 附影 游界 抚魂 匿迹 漂光 掩形'],
 鬼魅:['魅影 夜行 幻步 幽径 微痕 影纱 隐足 薄雾','游移 匿踪 换影 掠隙 浮身 潜步 藏锋 寻径'],
 幻象:['蜃光 梦幕 虚纹 幻棱 霞镜 迷影 浮景 叠景','拟形 引目 隐真 折景 映空 转眸 织梦 显虚'],
 星力:['星轨 辰光 北斗 银河 宿纹 星轮 夜穹 天枢','循轨 引潮 牵光 映辰 照途 转宿 聚曜 定盘'],
 食物:['玉膳 甘露 灵羹 香穗 蜜浆 清酿 醇味 珍馔','调香 蓄甘 合味 养元 和炊 温膳 藏鲜 凝味'],
 滋养:['甘泉 春露 灵壤 温脉 润根 玉液 青芽 生息','涵元 催荣 护蕊 温养 润心 育芽 扶根 续春'],
 力量:['劲骨 刚臂 重锋 雄躯 力脉 震纹 蓄弓 苍拳','贯劲 传锋 振岳 开碑 拔山 拂石 凝势 扬威'],
 极致力量:['山岳 铁脊 洪劲 天柱 龙骨 巨弓 磐臂 镇锤','撼岳 贯峰 振空 崩岩 凝锋 承天 破障 震穹'],
 吞噬:['幽渊 渊口 噬纹 容炉 纳壤 回环 玄腹 藏海','纳流 摄芒 化质 蓄元 融息 拾烬 含锋 归元'],
 血煞:['赤契 血纹 殷痕 丹魄 绛脉 血誓 赤锋 战血','沸心 刻契 引势 激锋 燃志 铭誓 凝印 振魄'],
 复刻:['摹纹 录影 学痕 拓墨 仿锋 誊光 参镜 习卷','摹形 变章 修技 合式 观法 演锋 拓势 辨真'],
 镜像:['棱镜 明面 银镜 双影 映池 镜纹 澄面 光隙','映辉 折月 转照 对映 分光 回照 借形 叠映'],
 坚固:['磐纹 固骨 镇柱 石心 钢壳 厚壁 坚脊 韧环','承锋 定架 铸形 护心 担岳 固根 立骨 藏劲'],
 战意:['战旗 雄心 势纹 斗志 骁锋 热血 锐气 战鼓','奋锋 砺胆 聚勇 扬志 昂首 进势 凝威 振气'],
 增幅:['汇流 聚芒 共脉 合光 灵枢 放镜 集纹 并束','扬辉 拓势 合奏 聚力 传芒 展幅 引光 共耀'],
 破魂:['截流 断脉 锐念 拆纹 扰环 破符 裂识 隙光','截息 扰锋 开隙 切脉 拆势 断织 引漏 裂印'],
 斩切:['月刃 刃隙 锐线 断纹 轻锋 寒刃 斩影 切芒','开锋 分流 解结 划影 截枝 剖玉 穿隙 裂帛'],
 空间:['界隙 锚纹 远门 虚轴 空廊 折径 界环 方寸','移星 换位 隔流 折步 定界 引径 分域 转隙'],
 再生:['新芽 愈纹 复骨 生环 活髓 续脉 青痕 灵蜕','复形 塑骨 续枝 愈合 新生 舒展 归整 修脉'],
 湮灭:['空痕 寂核 消纹 灰界 寂芒 余烬 零隙 空印','蚀形 消锋 留白 归寂 解构 失光 断续 退界'],
 秩序:['律纹 约印 法环 序章 规尺 准星 序轴 誓契','定衡 行约 执律 合序 守则 归位 正轨 齐步'],
 纯化:['澄泉 净核 清晶 素焰 真髓 洁光 纯纹 明露','析杂 淬真 净芒 提粹 凝清 辨质 澄心 洗锋'],
 生命:['生脉 活泉 灵芽 心叶 青络 息环 绿萤 血芽','维息 舒芽 孕春 连心 催活 养脉 抚伤 续辉'],
 因果:['契线 往痕 因纹 果印 记环 旧约 见证 缘轴','记功 兑现 连因 承果 循迹 留证 应契 结缘'],
 生命循环:['轮根 回泉 枯荣 生环 息轮 归叶 春序 环脉','更生 还根 续荣 拾落 轮转 归息 复青 养环'],
 普通:['素锋 古技 熟手 常心 匠纹 素刃 旧弦 平石','磨砺 应变 练心 趁势 稳步 巧用 见微 成器'],
 血:['绛流 赤纹 血脉 殷印 丹流 红绫 心络 赤滴','引脉 流转 刻印 连心 沸息 凝痕 牵流 续契'],
 魂力塑形:['灵模 魂纹 构架 形枢 灵线 塑核 魂晶 灵胚','凝形 重组 编织 合构 显形 转模 筑锋 塑甲']
};
const NAMING_VERSION=2;
const TONES='初 澄 玄 灵 苍 素 凝 微 皓 幽 远 静 古 清 真 逸'.split(' ');
const norm=s=>String(s||'').normalize('NFKC').replace(/[\p{P}\p{Z}\p{C}]/gu,'').toLowerCase();
function hash(s){let h=2166136261;for(const c of s)h=Math.imul(h^c.charCodeAt(0),16777619);return h>>>0;}
function candidates(t,{seed='属性命名-v11',limit=16}={}){
 if(!t?.soulId||!t.keyword||!WORDS[t.primaryAttribute])throw Error('命名需要已绑定的武魂ID、主属性与属性关键词');
 const [heads,tails]=WORDS[t.primaryAttribute].map(s=>s.split(' ')),shortTotal=heads.length*tails.length,total=shortTotal*(TONES.length+1);
 const input=[seed,t.soulId,t.primaryAttribute,t.keyword].join('|'),start=hash(input)%shortTotal,step=(hash(input+'|step')%shortTotal)|1,names=[];
 if(!Number.isInteger(limit)||limit<1||limit>total)throw Error('命名候选数超出词库容量');
 for(let i=0;i<limit;i++){const n=(start+(i%shortTotal)*step)%shortTotal,tail=tails[n%tails.length],head=heads[Math.floor(n/tails.length)%heads.length],tone=i<shortTotal?'':TONES[Math.floor(i/shortTotal)-1];names.push(t.keyword+'·'+tone+head+tail);}
 return names;
}
function renameTraits(items,{seed='属性命名-v11',preserveExisting=true}={}){
 if(!Array.isArray(items))throw Error('需要特性数组');const out=JSON.parse(JSON.stringify(items)),ids=new Set(),used=new Set(),changes=[];
 const keep=t=>preserveExisting&&t.naming?.version===NAMING_VERSION&&t.naming.seed===seed&&t.naming.attribute===t.primaryAttribute&&t.naming.keyword===t.keyword&&t.name.startsWith(t.keyword+'·');
 for(const t of out){if(ids.has(t.soulId))throw Error('重复武魂ID：'+t.soulId);ids.add(t.soulId);if(keep(t)){if(used.has(norm(t.name)))throw Error('已有命名重复：'+t.name);used.add(norm(t.name));}}
 for(const t of [...out].sort((a,b)=>a.soulId<b.soulId?-1:1)){
  if(keep(t))continue;
  const name=candidates(t,{seed,limit:1088}).find(n=>!used.has(norm(n)));if(!name)throw Error('属性命名空间耗尽：'+t.primaryAttribute+'；请扩充意象词库');used.add(norm(name));const oldName=t.name;t.name=name;t.naming={version:NAMING_VERSION,seed,basis:'primaryAttribute+keyword+soulId; never spec/kind',attribute:t.primaryAttribute,keyword:t.keyword};if(oldName!==name)changes.push({soulId:t.soulId,oldName,newName:name,attribute:t.primaryAttribute,keyword:t.keyword});
 }
 return {items:out,changes,uniqueNames:used.size};
}
return Object.freeze({version:NAMING_VERSION,WORDS,candidates,renameTraits,normalizeName:norm});
});
