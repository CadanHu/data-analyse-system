import aiosqlite
import asyncio

async def test_chinook():
    async with aiosqlite.connect('../data/Chinook_Sqlite.sqlite') as conn:
        async with conn.execute('SELECT name FROM sqlite_master WHERE type="table" LIMIT 10') as cursor:
            tables = [row[0] for row in await cursor.fetchall()]
            print('Chinook tables:', tables)

async def test_northwind():
    async with aiosqlite.connect('../data/northwind.db') as conn:
        async with conn.execute('SELECT name FROM sqlite_master WHERE type="table" LIMIT 10') as cursor:
            tables = [row[0] for row in await cursor.fetchall()]
            print('Northwind tables:', tables)

async def main():
    await test_chinook()
    await test_northwind()

if __name__ == '__main__':
    asyncio.run(main())