import { FormattedMessage } from 'react-intl';
import ky from 'ky';
import queryString from 'query-string';
import { useInfiniteQuery } from 'react-query';
import { useState } from 'react';


import { Button, LoadingPane, Modal, MultiColumnList, Pane, Paneset } from '@folio/stripes/components';
import { useIntlCallout } from '@projectreshare/stripes-reshare';

import SearchAndFilter from './components/SearchAndFilter';
import css from './index.css';

//const metaProxyUrl = "http://reshare-mp.folio-dev.indexdata.com:9000";
//const metaProxyUrl = "http://localhost:8010/proxy";


const PER_PAGE = 60;


//Turn a single marcxml record into a format reshare can use
const marcxmlToReshareForm = rec => {
  let titleVal = getDataByTagAndSubfield(rec, "245", ["a", "b", "c"] )?.trim();
  let authorVal = getDataByTagAndSubfield(rec, "100", "a")?.trim();
  let publisherVal = getDataByTagAndSubfield(rec, "264", "b")?.trim();
  let publisherPlaceVal = getDataByTagAndSubfield(rec, "264", "a")?.trim();
  let publisherDateVal = getDataByTagAndSubfield(rec, "264", "c")?.trim();
  let uniqueIdentifier = getDatabyControlfield(rec, "001")?.trim();

  let res = {
      title: titleVal,
      author: authorVal,
      publisher: publisherVal,
      publicationDate: publisherDateVal,
      placeOfPublication: publisherPlaceVal,
      systemInstanceIdentifier: uniqueIdentifier
  };

  // exclude fields without truthy value such as those containing an empty string
  return Object.fromEntries(Object.entries(res).filter(([_key, value]) => value));
}

const getReshareRecordsFromSet = recs => {
  let ret = [];
  for ( const rec of recs) {
    ret.push(marcxmlToReshareForm(rec));
  }
  return ret;
}

const getRecordsFromXMLResponse = doc => {
  //Should we be using getElementsByTagNameNS?
  return doc.getElementsByTagName("record");
}

const getDataByTagAndSubfield = (rec, tagName, subField, sep=" ") => {
  let nodeList = rec.getElementsByTagName("datafield");
  for (const element of nodeList ) {
    if (element.getAttribute("tag") == tagName) {
      if (subField) {
        const subFieldValueList = [];
        if (!Array.isArray(subField)) {
          subField = [ subField ];
        }
        for ( const sub of subField ) {
          let subfieldNodeList = element.getElementsByTagName("subfield");
          for (const subelement of subfieldNodeList) {
            if (subelement.getAttribute("code") == sub) {
              subFieldValueList.push(subelement?.textContent)
            }
          }
        }
        return subFieldValueList.join(sep);
      } else {
        return element?.textContent;
      }
    }
  }
}

const getDatabyControlfield = (rec, tagName) => {
  let nodeList = rec.getElementsByTagName("controlfield");
  for (const element of nodeList) {
    if (element.getAttribute("tag") == tagName) {
      return element?.textContent;
    }
  }
}

const getTotalRecordCount = (xmlDoc) => {
  let intVal = 0;
  try {
    const namespace = xmlDoc.documentElement.namespaceURI;
    const elements = xmlDoc.getElementsByTagNameNS(namespace, "numberOfRecords");
    intVal = parseInt(elements[0].textContent);
  } catch (error){
    console.error(error);
  }
  return intVal
}

const PluginRsSIQueryMetaproxy = ({ 
  disabled, endpoint, selectInstance, searchButtonStyle, searchLabel, specifiedId,
  xPassword, xUsername, metaproxyUrl }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [searchParams, setSearchParams] = useState('');
  const sendCallout = useIntlCallout();

  const queryFunc = async ({ pageParam = 1 }) => { 
    const queryParams = {
      "x-target" : `${endpoint}`,
      "x-pquery" : searchParams["x-pquery"],
      "maximumRecords" : PER_PAGE,
      "recordSchema" : "marcxml",
      "x-username" : xUsername,
      "x-password" : xPassword,
      "startRecord" : ((pageParam - 1) * PER_PAGE) + 1
    };
    const queryUrl = `${metaproxyUrl}/?${queryString.stringify(queryParams)}`;
    console.log(queryUrl);
    const res = await ky(queryUrl);
    const text = await res.text();
    return text;
  }

  const query = useInfiniteQuery({
    queryKey: ['metaproxyLookup', searchParams],
    queryFn: queryFunc,
    useErrorBoundary: true,
    staleTime: 2 * 60 * 1000,
    cacheTime: 10 * 60 * 1000,
    enabled: !!searchParams,
  });

  let results = null;
  let totalCount = 0;

  if ( query?.data?.pages) {
    results = [];
    for (const page of query?.data?.pages) {
      const resultXML = page;
      if (resultXML) {
        const resultXMLDoc = new DOMParser().parseFromString(resultXML, "application/xml");
        if (resultXMLDoc) {
          const resultRecs = getRecordsFromXMLResponse(resultXMLDoc); 
          for ( const resultRec of getReshareRecordsFromSet(resultRecs)) {
            results.push(resultRec);
          }
          totalCount = getTotalRecordCount(resultXMLDoc);
        }
      }
    }
  }
  
  

  const onButton = async () => {
    if (!specifiedId) {
      setIsOpen(true);
      return;
    }

    const queryParams = {
      "x-target" : endpoint,
      "x-pquery" : `@attr 1=12 ${specifiedId}`,
      "maximumRecords" : 1,
      "recordSchema" : "marcxml",
      "x-username" : xUsername,
      "x-password" : xPassword
    };
    const queryUrl = `${metaproxyUrl}/?${queryString.stringify(queryParams)}`;
    console.log(queryUrl);
    const res = await ky(queryUrl)
      .catch(async e => {
        const errBody = await e.response?.text();
        const errMsg = (typeof errBody === 'string' && errBody.startsWith('{')) ? JSON.parse(errBody)?.statusMessage : '';
        sendCallout('ui-plugin-rs-metaproxy.byIdError', 'error', { errMsg });
      });
    console.dir(res);
    

    if (res?.statusText == 'OK') {
      let text = await res.text();
      const parser = new DOMParser();
      const xmlDoc = parser.parseFromString(text, "application/xml");
      let recs = getRecordsFromXMLResponse(xmlDoc);
      let nextRec = recs[0];
      console.dir(nextRec);
      let reshareObject = marcxmlToReshareForm(nextRec);
      selectInstance(reshareObject);
    }
  };

  const onSelect = record => {
    selectInstance(record);
    setIsOpen(false);
  };

  return (
    <>
      <Button
        buttonStyle={searchButtonStyle}
        disabled={disabled}
        onClick={onButton}
      >
        {searchLabel}
      </Button>
      <Modal
        label={<FormattedMessage id="ui-plugin-rs-siquery-metaproxy.modal.title" />}
        open={isOpen}
        onClose={() => setIsOpen(false)}
        closeOnBackgroundClick
        dismissible
        contentClass={css.pluginModalContent}
        style={{ width: '80vw', 'maxWidth': '80vw', height: '80vw' }}
      >
        <Paneset isRoot>
          <Pane
            defaultWidth="20%"
            paneTitle={<FormattedMessage id="stripes-smart-components.searchAndFilter" />}
          >
            <SearchAndFilter setSearchParams={setSearchParams} />
          </Pane>
          {query.isSuccess &&
            <Pane
              defaultWidth="fill"
              noOverflow
              padContent={false}
              paneTitle={<FormattedMessage id="ui-plugin-rs-siquery-metaproxy.resultsHeader" />}
              paneSub={<FormattedMessage id="ui-rs.patronrequests.found" values={{ number: totalCount }} />}
            >
              <MultiColumnList
                autosize
                columnMapping={{
                  title: <FormattedMessage id="ui-plugin-rs-siquery-metaproxy.columns.title" />,
                  author: <FormattedMessage id="ui-plugin-rs-siquery-metaproxy.columns.author" />,
                  publicationDate: <FormattedMessage id="ui-plugin-rs-siquery-metaproxy.columns.publicationDate" />,
                }}
                contentData={results}
                hasMargin
                loading={query?.isFetching}
                onNeedMoreData={(_ask, index) => { 
                  console.log(`calling onNeedMoreData with index ${index}`);
                  query.fetchNextPage({ pageParam: Math.ceil(index / PER_PAGE) })
                }}
                onRowClick={(_e, row) => onSelect(row)}
                pageAmount={PER_PAGE}
                totalCount={totalCount}
                virtualize
                visibleColumns={['title', 'author', 'publicationDate']}
              />
            </Pane>
          }
          {query.isLoading &&
            <LoadingPane />
          }
        </Paneset>
      </Modal>
    </>
  );
};

export default PluginRsSIQueryMetaproxy;
