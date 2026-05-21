const env = useRuntimeConfig()

const update = async (id: number, title: string)=> {
    //PUT
    return fetch(`https://cloud.zectrix.com/open/v1/todos/${id}`, {
        method: 'PUT',
        headers: {
            'X-API-Key': env.APIKEY,
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({
            title,
            dueDate: null,
            dueTime: null,
            priority: 0,
        })
    })
}

const add = async (title: string)=> {
    //POST
    return fetch(`https://cloud.zectrix.com/open/v1/todos`, {
        method: 'POST',
        headers: {
            'X-API-Key': env.APIKEY,
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({
            title,
        })
    })
}

const del = async (id: number)=> {
    //DELETE
    return fetch(`https://cloud.zectrix.com/open/v1/todos/${id}`, {
        method: 'DELETE',
        headers: {
            'X-API-Key': env.APIKEY,
        }
    })
}

export default defineEventHandler(async (event) => {
    //获取.env的APIKEY

    const params = new URLSearchParams({
        status:0+'',
        deviceId: env.DEVICEID,
    })

    const res = await fetch(`https://cloud.zectrix.com/open/v1/todos?${params}`,{
         headers: {
            'X-API-Key': env.APIKEY,
            'Accept': 'application/json'
        }
    })
    const todo = await res.json()
    const todoList = todo.data || []

    const weiboRes = await fetch('https://weibo.com/ajax/statuses/hot_band', {
        headers: {
            referer: 'https://weibo.com/',
        }
    })
    const weibo = await weiboRes.json()

    //根据num排序
    weibo.data.band_list.slice(0, 10).forEach(async (item: any, index: number) => {
        const title =  (item.label_name || '新') + ' | ' + item.word
        if( index < todoList.length - 1) {
            await update(todoList[index].id, title)
        }else {
            await add(title)
        }
    })

    if(todoList.length > 10) {
        // 删除10后的
        for(let i = 10; i < todoList.length; i++) {
            await del(todoList[i].id)
        }
    }


    return {
        completed: true
    }

})