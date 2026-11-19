import { receiptSections, PRINT_CREDIT } from './receiptLayout.js'

export function wrapReceiptText(context, text, width) {
  const lines = []
  for (const paragraph of String(text).split(/\r?\n/)) {
    let line = ''
    for (const word of paragraph.split(/\s+/).filter(Boolean)) {
      const candidate = line ? `${line} ${word}` : word
      if (context.measureText(candidate).width <= width) { line = candidate; continue }
      if (line) { lines.push(line); line = '' }
      for (const char of word) {
        if (line && context.measureText(line + char).width > width) { lines.push(line); line = '' }
        line += char
      }
    }
    lines.push(line)
  }
  return lines
}

export async function createReceiptImages(doc, {language,title,subtitle,sections,note,company}, paper = '80') {
  const width = paper === '58' ? 384 : 576, margin = 12, padding = 6, lineHeight = 29, maxHeight = 6000, footerHeight = 40
  const canvas = doc.createElement('canvas'), context = canvas.getContext('2d')
  if (!context) throw new Error('IMAGE_UNAVAILABLE')
  const dari = language === 'fa', commands = []
  const font = (size,bold=false) => `${bold ? 'bold ' : ''}${size}px "Pedram Print", Tahoma, Arial, sans-serif`
  function text(text,size,bold=false,center=false) {
    context.font = font(size,bold)
    const lines = wrapReceiptText(context,text,width-margin*2)
    commands.push({type:'text',lines:lines.map(text=>({text,size,bold})),center,height:lines.length*lineHeight+6})
  }
  function row(values,weights,header=false,repeatHeader=null) {
    const sum = weights.reduce((total,value)=>total+value,0)
    const widths = weights.map(value=>(width-margin*2)*value/sum)
    const size = header ? 19 : 22
    context.font = font(size,header)
    const cells = values.map((value,index)=>wrapReceiptText(context,value,widths[index]-padding*2).map(text=>({text,size,bold:header})))
    const totalLines = Math.max(1,...cells.map(cell=>cell.length)), maxLines = 180
    let first
    for (let start=0;start<totalLines;start+=maxLines) {
      const lines = Math.min(maxLines,totalLines-start)
      const command = {type:'row',cells:cells.map(cell=>cell.slice(start,start+maxLines)),widths,height:lines*lineHeight+padding*2,repeatHeader}
      commands.push(command); first ||= command
    }
    return first
  }
  text(company,25,true,true); text(title,28,true,true)
  if (subtitle) text(subtitle,20,false,true)
  for (const section of receiptSections(sections,paper)) {
    commands.push({type:'rule',height:14})
    if (section.title) { text(section.title,24,true,true); commands.at(-1).keepNext=true }
    for (const table of section.tables) {
      const header = row(table.headers,table.widths,true)
      header.keepNext=true
      for (const values of table.rows) row(values,table.widths,false,header)
      if (table.recordEnd) commands.push({type:'gap',height:8})
    }
  }
  if (note) text(note,19,false,true)
  const chunks = []; let chunk = [], height = margin*2+footerHeight
  for (let index=0;index<commands.length;index++) {
    const command=commands[index], reserve=command.keepNext ? commands[index+1]?.height || 0 : 0
    if (height+command.height+reserve>maxHeight && chunk.length) {
      chunks.push(chunk); chunk=[]; height=margin*2+footerHeight
      if (command.repeatHeader) { chunk.push(command.repeatHeader); height+=command.repeatHeader.height }
    }
    chunk.push(command); height+=command.height
  }
  if (chunk.length) chunks.push(chunk)
  const images=[]
  for (const chunk of chunks) {
    canvas.width=width; canvas.height=margin*2+footerHeight+chunk.reduce((sum,command)=>sum+command.height,0)
    context.fillStyle='#fff'; context.fillRect(0,0,canvas.width,canvas.height)
    context.fillStyle='#000'; context.strokeStyle='#000'; context.lineWidth=1
    context.direction=dari?'rtl':'ltr'; context.textBaseline='top'
    let y=margin
    for (const command of chunk) {
      if (command.type==='rule') { context.beginPath();context.moveTo(margin,y+7);context.lineTo(width-margin,y+7);context.stroke() }
      if (command.type==='text') {
        context.textAlign=command.center?'center':dari?'right':'left'
        command.lines.forEach((line,index)=>{context.font=font(line.size,line.bold);context.fillText(line.text,command.center?width/2:dari?width-margin:margin,y+index*lineHeight)})
      }
      if (command.type==='row') {
        context.textAlign='center'
        let offset=0
        command.cells.forEach((lines,index)=>{
          const cellWidth=command.widths[index], x=dari?width-margin-offset-cellWidth:margin+offset
          context.strokeRect(x,y,cellWidth,command.height)
          lines.forEach((line,lineIndex)=>{context.font=font(line.size,line.bold);context.fillText(line.text,x+cellWidth/2,y+padding+lineIndex*lineHeight)})
          offset+=cellWidth
        })
      }
      y+=command.height
    }
    context.direction='ltr';context.textAlign='center';context.font='16px Arial, sans-serif'
    context.beginPath();context.moveTo(margin,y+5);context.lineTo(width-margin,y+5);context.stroke()
    context.fillText(PRINT_CREDIT,width/2,y+14)
    const blob=await new Promise(resolve=>canvas.toBlob(resolve,'image/png'))
    if (!blob) throw new Error('IMAGE_UNAVAILABLE')
    images.push(blob)
  }
  return images
}
