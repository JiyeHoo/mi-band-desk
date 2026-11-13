// Mainland China schedule, State Council notice 国办发明电〔2025〕7号.
// https://www.gov.cn/zhengce/content/202511/content_7047090.htm
// Never infer compensatory work/rest days for a year we have not verified.
export const HOLIDAY_YEAR = 2026
const breaks = [[101,103],[215,223],[404,406],[501,505],[619,621],[925,927],[1001,1007]]
const workdays = [104,214,228,509,920,1010]
const festivals2026 = {101:'元旦',216:'除夕',217:'春节',405:'清明',501:'劳动',619:'端午',925:'中秋',1001:'国庆'}
const fixedFestivals = {101:'元旦',501:'劳动',1001:'国庆'}
export function holidayFor(date) {
  const code=(date.getMonth()+1)*100+date.getDate(),known=date.getFullYear()===HOLIDAY_YEAR
  return { festival:(known?festivals2026:fixedFestivals)[code]||'',
    mark:!known?'':workdays.indexOf(code)!==-1?'班':breaks.some(range=>code>=range[0]&&code<=range[1])?'休':'',known }
}
