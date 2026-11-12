import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createServer } from 'vite'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'

test('Fleet and booking detail views keep related fields grouped and preserve data in both languages', async () => {
  const server = await createServer({ server:{ middlewareMode:true, hmr:false }, appType:'custom' })
  try {
    const { default:FleetInformation } = await server.ssrLoadModule('/src/components/FleetInformation.jsx')
    const { default:BookingInformation } = await server.ssrLoadModule('/src/components/BookingInformation.jsx')
    const render = (Component,props) => renderToStaticMarkup(React.createElement(Component,props))
    const person = { first_name:'Sana',surname:'Azizi',full_name:'Sana Azizi',father_name:'Father',phone:'0700000000',phone_secondary:'0700000001',province:'Kabul',district:'District',village:'Village',address:'Original long address',notes:'First line\nSecond line',national_id:'legacy-id',license_number:'legacy-license',license_expiry:'2099-12-31',previous_company:'Previous employer',destination_company:'Next employer',left_company_at:'2026-11-12',status:'available' }
    const vehicle = { plate_number:'KBL-100',province:'Kabul',vehicle_type:'Truck',vehicle_condition:'Container',model:'FH16',color:'White',foreign_plate_number:'Foreign-100',gross_weight_kg:'53000',empty_weight_kg:0,capacity_tons:'53',volume_capacity_m3:'70',owner_id:'owner',vin_number:'Legacy VIN',model_year:'1400',permit_number:'Legacy permit',permit_expiry:'2099-12-31',notes:'Vehicle notes',status:'available' }
    const booking = { booking_number:10,booking_date:'2026-11-12',status:'confirmed',service_type:'managed',branch_id:'branch',trader_first_name:'Trader',trader_last_name:'Name',trader_phone:'0700000010',trader_address:'Trader long address',sender_name:'Sender',sender_phone:'0700000011',sender_address:'Sender long address',receiver_name:'Receiver',receiver_phone:'0700000012',receiver_address:'Receiver long address',goods:'Food',quantity_amount:'5.5',quantity_unit:'tons',origin:'Kabul',destination:'Herat',commission_amount:'100',commission_currency:'USD',freight_amount:'0',carrier_cost:'75.25',other_expenses:[{description:'Unloading and additional handling',amount:'12.50'}],charged:'187.75',paid:'100.00',vehicles:{plate_number:'KBL-100'},drivers:{full_name:'Sana Azizi'} }
    for (const language of ['en','fa']) {
      for (const kind of ['driver','owner']) {
        const html = render(FleetInformation,{kind,row:person,language})
        for (const text of ['Sana','Azizi','Father','0700000000','0700000001','Kabul','District','Village','Original long address','First line\nSecond line','legacy-id','legacy-license','Previous employer','Next employer']) assert.ok(html.includes(text),`${kind}: ${text}`)
        assert.ok(html.indexOf('Sana') < html.indexOf('Azizi'))
        assert.ok(html.indexOf('Father') < html.indexOf('0700000000'))
        assert.match(html,/fleet-address-grid/)
        assert.match(html,/<bdi dir="ltr">0700000000<\/bdi>/)
        assert.doesNotMatch(html,/fleet-profile-frame|<img/)
      }
      const legacyPerson = render(FleetInformation,{kind:'owner',row:{full_name:'Legacy complete name',address:'Legacy full home address',phone:'0700000000'},language})
      assert.match(legacyPerson,/Legacy complete name/)
      assert.match(legacyPerson,/Legacy full home address/)
      const htmlVehicle = render(FleetInformation,{kind:'vehicle',row:vehicle,owner:person,language,photoUrl:'https://example.test/vehicle.jpg'})
      for (const text of ['KBL-100','Kabul','Truck','Container','FH16','White','Foreign-100','53000','Legacy VIN','1400','Legacy permit','Vehicle notes','Sana Azizi']) assert.ok(htmlVehicle.includes(text),text)
      assert.match(htmlVehicle,/<bdi dir="ltr">0<\/bdi>/)
      assert.match(htmlVehicle,/class="fleet-information-photo"/)
      const presidentHtml = render(BookingInformation,{row:booking,language,president:true,branch:{name:'Branch office'},onPrint(){}})
      for (const text of ['Trader Name','Sender','Receiver','Trader long address','Sender long address','Receiver long address','Food','5.5','Kabul','Herat','KBL-100','Sana Azizi','100.00 USD','0.00 USD','75.25 USD','12.50 USD','187.75 USD','87.75 USD','Unloading and additional handling','Branch office']) assert.ok(presidentHtml.includes(text),text)
      assert.match(presidentHtml,/<bdi dir="ltr">0700000011<\/bdi>/)
      assert.doesNotMatch(presidentHtml,/undefined|NaN/)
      assert.match(presidentHtml,/Print confirmation|چاپ تأییدیه/)
      const branchHtml = render(BookingInformation,{row:booking,language,president:false,onPrint(){}})
      assert.doesNotMatch(branchHtml,/Payment summary|خلاصه پرداخت|187\.75 USD|87\.75 USD/)
      assert.match(branchHtml,/75\.25 USD/)
      const fallbackHtml = render(BookingInformation,{row:{...booking,trader_first_name:undefined,trader_last_name:undefined,traders:{full_name:'Legacy trader',phone:'0700000099'},other_expenses:[]},language,onPrint(){}})
      assert.match(fallbackHtml,/Legacy trader/)
      assert.doesNotMatch(fallbackHtml,/undefined|NaN/)
    }
  } finally { await server.close() }
})
