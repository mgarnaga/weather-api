import fetch from 'node-fetch';
import express from 'express';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import rateLimit from 'express-rate-limit';

const app = express();
const PORT = process.env.PORT || 3000;

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// лимитируем запросы от одного ip по количеству в час
const limiter = rateLimit({
    windowMs: 60 * 60 * 1000,
    max: 100, // 100 в час
    message: 'Слишком много запросов, попробуйте повторить позднее'
});

app.use(express.static(join('css')));
app.use(express.static(join(__dirname, 'views')));
app.use(limiter);

// функция с запросом к yr.no
const fetchWeather = async (latitude, longitude) => {
    try {
    // конструируем запрос на yr.no
    const apiUrl = `https://api.met.no/weatherapi/locationforecast/2.0/compact?lat=${latitude}&lon=${longitude}`;
    const headers = {
        'User-Agent': 'weatherApp github.com/mgarnaga'
    }
    // отправляем ожидаем
    const response = await fetch(apiUrl, {
        headers: headers
    });
    const data = await response.json();

    // достаем дату и время из iso таймстемпов
    const extractDateTime = (isoDateTime) => {
        const [date, time] = isoDateTime.split('T');
        return { date, time: time.slice(0, 5) }; // слайсим только время
    };
    
    // фильтрация объектов по времени 14:00 используя функцию выше
    const filterByTime = (entries) => {
        return entries.filter(entry => extractDateTime(entry.time).time === '11:00'); // для 11:00 по UTC у нас +3 (14:00)
    };
    
    // оставляем нужные объекты из полученного json
    const relevantEntries = filterByTime(data.properties.timeseries);

    // и генерируем свой API
    const apiResponse = relevantEntries.map(entry => {
        const { date } = extractDateTime(entry.time);
        return { date, air_temperature: entry.data.instant.details.air_temperature };
    });

    // отправляем ответ
    return apiResponse;
    }  catch(error) {
    console.error('Error fetching from yr.no', error);
    res.status(500).json({error: 'Unable to fetch data from yr.no'});
    }
};


// по дефолтному route открываем веб-интерфейс
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'views', 'index.html'));
});

// api если запрос на москву 
app.get('/moscow', async (req, res) => {
    try {
        const data = await fetchWeather('55.7558', '37.6173');
        res.json(data);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// api для координат
app.get('/:lat&:lon', async (req, res) => {
    try {
        // добываем координаты из запроса
        const { lat, lon } = req.params;

        const data = await fetchWeather(lat, lon);
        res.json(data);

    // на случай ошибки
    } catch(error) {
        res.status(500).json({error: error.message});
    }
});

// если запрошенный route не существует
app.all('*', (req, res) => 
res.send('Invalid route'));

// слушаем сервер
app.listen(PORT, () => console.log(`Listening on ${PORT}`));