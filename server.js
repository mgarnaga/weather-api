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
    
    function linInterp(x, x0, y0, x1, y1) {
        return y0 + ((x - x0) * (y1 - y0)) / (x1 - x0); // результат = темп6 + ((время11 - время6) * (темп12 - темп6)) / (время12 - время6)
    }

    const filterByTime = (entries) => {

        const relevant = {}

        // для каждой entry в полученной дате отделяем нужные для выборки даты и часы
        entries.forEach(entry => {
            const { date, time } = extractDateTime(entry.time);
            const temperature = entry.data.instant.details.air_temperature;
            relevant[date] = relevant[date] || {};

            if (time === '11:00') {
                relevant[date].temp11 = temperature;
            } else if (time === '06:00') {
                relevant[date].temp6 = temperature;
            } else if (time === '12:00') {
                relevant[date].temp12 = temperature;
            }
        });
    
        // итерируем даты и где нет температуры на 11:00 рассчитываем ее по линейной интерполяции исходя из промежутка 6:00-12:00 и добавляем в дату
        Object.keys(relevant).forEach(date => {
            const { temp6, temp12, temp11 } = relevant[date];
            if (temp11 === undefined && temp6 !== undefined && temp12 !== undefined) {
                const temperature11 = linInterp(11, 6, temp6, 12, temp12);
                relevant[date].temp11 = Number(temperature11.toFixed(1));
            }
            if ( temp6 === undefined || temp12 === undefined ) {
                delete relevant[date];
            }
        });

        console.log(relevant);
        return relevant;
    };
    
    // фильтруем нужные объекты из полученного json, делаем из объектов массив с выборкой 11:00
    const relevantEntries = filterByTime(data.properties.timeseries);
    const apiResponse = Object.entries(relevantEntries).map(([date, temps]) => ({ date, air_temperature: temps.temp11 }));

    // отправляем ответ
    console.log(apiResponse);
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