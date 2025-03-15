const { ScriptGroupDB, ScriptsDB } = require('../utils/db-class')
const scriptGroupDB = new ScriptGroupDB().getInstance()
const scriptsDB = new ScriptsDB().getInstance()

async function getScriptGroupList({ res }) {
  let data = await scriptGroupDB.findAsync({})
  data = data.map(item => ({ ...item, id: item._id }))
  data?.sort((a, b) => Number(b.index || 0) - Number(a.index || 0))
  res.success({ data })
}

const addScriptGroup = async ({ res, request }) => {
  let { body: { name, index } } = request
  if (!name) return res.fail({ data: false, msg: '参数错误' })
  let group = { name, index }
  await scriptGroupDB.insertAsync(group)
  res.success({ data: '添加成功' })
}

const updateScriptGroup = async ({ res, request }) => {
  let { params: { id } } = request
  let { body: { name, index } } = request
  if (!id || !name) return res.fail({ data: false, msg: '参数错误' })
  let target = await scriptGroupDB.findOneAsync({ _id: id })
  if (!target) return res.fail({ data: false, msg: `分组ID${ id }不存在` })
  await scriptGroupDB.updateAsync({ _id: id }, { name, index: Number(index) || 0 })
  res.success({ data: '修改成功' })
}

const removeScriptGroup = async ({ res, request }) => {
  let { params: { id } } = request
  if (id === 'default') return res.fail({ data: false, msg: '保留分组, 禁止删除' })
  // 移除分组将所有该分组下脚本分配到default中去
  let scriptList = await scriptsDB.findAsync({})
  if (Array.isArray(scriptList) && scriptList.length > 0) {
    for (let item of scriptList) {
      if (item.group === id) {
        item.group = 'default'
        await scriptsDB.updateAsync({ _id: item._id }, item)
      }
    }
  }
  await scriptGroupDB.removeAsync({ _id: id })
  res.success({ data: '移除成功' })
}

module.exports = {
  addScriptGroup,
  getScriptGroupList,
  updateScriptGroup,
  removeScriptGroup
}